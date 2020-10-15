const shell = require('shelljs');
const path = require('path');
const ora = require('ora');
const fs = require('fs');


module.exports = (command) => {
  const destination = 'leetcode-crawled';
  if (!command.force && fs.existsSync(destination)) {
    console.error(`Already has ${destination} directory!`);
    return;
  }
  const websiteDirPath = path.join(__dirname, '..', 'packages', 'hugo-site');
  const spinner = ora(`Copying files into ${destination}...`).start();
  shell.cp('-R', websiteDirPath, destination);
  spinner.stop();
};
