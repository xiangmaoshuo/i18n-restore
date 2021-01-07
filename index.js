/**
 * 用法： node ./i18n-restore ../decision-engine-web
 */
const fs = require('fs');
const path = require('path');

const projectPath = isDirectory(process.argv[2]);
const targetPath = process.argv[3] || `.${path.sep}${path.basename(projectPath)}`;

delFolder(targetPath);

const srcPath = isDirectory(path.join(projectPath, './src'));
const i18nPath = isDirectory(path.join(srcPath, './i18n'));
const chFile = isFile(path.join(i18nPath, './ch.js'));
const enFile = isFile(path.join(i18nPath, './en.js'));

const chStr = fs.readFileSync(chFile, 'utf8').replace(/^export default/, '');
const ch = eval(`(() => {return ${chStr}})()`);

const promises = doRestore(srcPath).map((file) => {
    return new Promise((resolve, reject) => {
        fs.readFile(file, 'utf8', (err, data) => {
            if (err) {
                return reject(err);
            }
            // if (path.basename(file) === 'Flowsearch.vue') {
            //     debugger
            // }
            // try catch是为了捕获正则替换出问题时，定位文件
            try {
                const result = i18nRestore(data);
                const newFilePath = file.replace(srcPath, targetPath);
                writeFile(newFilePath, result).then(resolve, reject);
            } catch(err) {
                console.log(`当前文件：${path.resolve(__dirname, file)}`);
                throw err;
            }
        });
    });
});

Promise.all(promises).then(() => {
    console.log('i18n-restore success!');
});

function doRestore(prefixPath, result = []) {
    const array = fs.readdirSync(prefixPath, { withFileTypes: true });
    array.forEach((dirent) => {
        const resourcePath = path.join(prefixPath, dirent.name);
        if (dirent.isFile()) {
            if (/\.(vue|js)$/.test(dirent.name)) {
                result.push(resourcePath);
            } else {
                fs.readFile(resourcePath, (err, data) => {
                    if (err) {
                        throw err
                    }
                    writeFile(resourcePath.replace(srcPath, targetPath), data);
                });
            }
        } else if (dirent.isDirectory() && dirent.name !== 'i18n') {
            doRestore(resourcePath, result);
        }
    })
    return result;
}

/** 核心方法， 基于正则表达式对i18n语法进行替换 */
function i18nRestore(data) {
    // eg: i18n.t('common.name')
    return data.replace(/\w+\.t\((?:\s+)?('|")([\w\.]+)\1(?:\s+)?\)/g, (_, $1, $2) => replaceI18nExpression($2, $1))
    // eg: this.$t('common.name')
    .replace(/(?:this\.)?\$m?t\((?:\s+)?('|")([\w\.]+)\1(?:\s+)?\)/g, (_, $1, $2) => replaceI18nExpression($2, $1))
    // eg: $t('common.totalDataNumber',{0: total})
    .replace(/(?:this\.)?\$m?t\((?:\s+)?('|")([\w\.]+)\1,(?:\s+)?\{(?:\s+)?(.*)(?:\s+)?\}(?:\s+)?\)/g, (_, $1, $2, $3) => {
        const obj = {};
        $3.replace(/(\d):([^,]+)(,|$)/g, (__, index, expression) => {
            obj[index] = expression.trim();
        });
        const chText = replaceI18nExpression($2, '`');
        const regExp = new RegExp(`\{(${Object.keys(obj).join('|')})\}`, 'g');
        const finalText = chText.replace(regExp, (_, i) => `\${${obj[i]}}`);
        return finalText;
    })
    // eg: {{'姓名'}}
    .replace(/\{\{(?:\s+)?('|")([^\}]+)\1(?:\s+)?\}\}/g, (_, $1, $2) => {
        return $2;
    })
    // eg: :placeholder="'查询'"
    .replace(/:(?:\s+)?([\w-]+)(?:\s+)?=(?:\s+)?"(?:\s+)?'([^']*)'(?:\s+)?"/g, (_, $1, $2) => {
        return `${$1}="${$2}"`;
    })
    // eg: :placeholder='"查询"', 严格来讲这种写法不规范，如果项目中存在这种情况，可以打开这行
    // .replace(/:(?:\s+)?([\w-]+)(?:\s+)?=(?:\s+)?'(?:\s+)?"([^']*)"(?:\s+)?'/g, (_, $1, $2) => {
    //     return `${$1}="${$2}"`;
    // })
    // eg: `${'查询'}`, 如果有这种情况，意味着你的国际化是将该字符串单独翻译的，所以如果你不打算重新翻译文本的话，不要开启它
    // .replace(/`[^`]+`/g, (tmplStr, $1, $2) => {
    //     return tmplStr.replace(/\$\{('|")([^}\1]+)\1\}/g, (_, $1, $2) => {
    //         return $2;
    //     });
    // })
    // eg: $t('导入excel') ???
}

function replaceI18nExpression(key, mark) {
    return `${mark}${getValue(key.split('.'), ch)}${mark}`;
}

function getValue(array, obj) {
    if (!array.length) return obj;
    return getValue(array.slice(1), obj[array[0]]);
}

function isExist(path) {
    return fs.existsSync(path);
}

function isDirectory(path) {
    if (isExist(path) && fs.statSync(path).isDirectory()) {
        return path;
    }
    throw new Error(`${path} is not exist, or is not a directory!`);
}

function isFile(path) {
    if (isExist(path) && fs.statSync(path).isFile()) {
        return path;
    }
    throw new Error(`${path} is not exist, or is not a file!`);
}

function writeFile(filePath, data) {
    const array = path.dirname(filePath).split(path.sep);
    let dir = '';
    while (array.length) {
        dir = path.join(dir, array.shift());
        if (!isExist(dir)) {
            fs.mkdirSync(dir);
        }
    }
    return new Promise((resolve, reject) => {
        fs.writeFile(filePath, data, (err) => {
            if (err) {
                return reject(err);
            }
            return resolve();
        });
    });
}

function delFolder(prefixPath) {
    if(isExist(prefixPath)) {
        fs.readdirSync(prefixPath, { withFileTypes: true }).forEach((dirent) => {
            const resourcePath = path.join(prefixPath, dirent.name);
            if(fs.statSync(resourcePath).isDirectory()) {
                delFolder(resourcePath);
            } else {
                fs.unlinkSync(resourcePath);
            }
        });
        fs.rmdirSync(prefixPath);
    }
};
