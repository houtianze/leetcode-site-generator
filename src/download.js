const fs = require('fs');
const ora = require('ora');
const { stringify, delay } = require('./utils');
const { getAllQuestions, getAllACQuestions, getAcCode, getQuestionDetail } = require('./leetcode');

const difference = (problemsA = [], problemsB = []) => {
  const map = problemsB.reduce((acc, problem) => {
    acc[problem.titleSlug] = true;
    return acc;
  }, {});
  return problemsA.filter(problem => !map[problem.titleSlug]);
};
const download = async (command) => {
  const problemsPath = 'problems.json';
  let problems = [];
  // let questions = await getAllACQuestions();
  let questions = await getAllQuestions();
  if (!command.all) {
    if (fs.existsSync(problemsPath)) {
      problems = JSON.parse(fs.readFileSync(problemsPath));
    }
    questions = difference(questions, problems);
  }

  // const spinner = ora('Downloading accepted code...\n').start();
  const spinner = ora('Downloading questions, solutions, discussions...\n').start();
  const aux = async (xs = []) => {
    if (xs.length === 0) {
      return;
    }
    let current = xs.shift();

    // solution and tags
    const questionDetail = await getQuestionDetail(current.titleSlug);
    if (questionDetail) {
      current = questionDetail;
    }
    // accepted submissions
    try {
      const acceptedSubmission = await getAcCode(current.titleSlug);
      if (acceptedSubmission) {
        const {
          code,
          lang,
        } = acceptedSubmission;
        current.code = code;
        current.lang = lang;
      }
    } catch (error) {
      console.error(error.message);
    }
    spinner.text = `${questions.length - xs.length}/${questions.length}: [${current.title}] has been downloaded.`;
    problems.push(current);
    fs.writeFileSync(problemsPath, stringify(problems));
    // slow down a bit
    const delayInMs = Math.random() * 2020;
    await delay(delayInMs);
    await aux(xs);
  };
  await aux([...questions]);
  spinner.stop();
};

module.exports = download;
