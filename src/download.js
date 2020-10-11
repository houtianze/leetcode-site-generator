const fs = require('fs');
const ora = require('ora');
const { stringify, delay } = require('./utils');
const {
  getAllQuestions, getAcCode, getQuestionDetail, getQuestionTopicsList, getTopicDetail,
} = require('./leetcode');
const { DiscussionTopicCounts } = require('./const');

const difference = (problemsA = [], problemsB = []) => {
  const map = problemsB.reduce((acc, problem) => {
    acc[problem.titleSlug] = true;
    return acc;
  }, {});
  return problemsA.filter(problem => !map[problem.titleSlug]);
};

const waitForAWhile = async () => {
  // slow down a bit
  const delayInMs = Math.random() * 2020;
  await delay(delayInMs);
};

const download = async (command) => {
  const problemsPath = 'problems.json';
  let problems = [];
  // let questions = await getAllACQuestions();
  const allQuestions = await getAllQuestions();
  let questions = allQuestions;
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
    spinner.text = `Solutions: ${questions.length - xs.length}/${questions.length}: [${current.title}] has been downloaded.`;
    problems.push(current);
    fs.writeFileSync(problemsPath, stringify(problems));

    await waitForAWhile();
    await aux(xs);
  };

  const getDiscussions = async () => {
    const discussionsPath = 'discussions.json';
    let discussions = {};
    if (fs.existsSync(discussionsPath)) {
      try {
        discussions = JSON.parse(fs.readFileSync(discussionsPath));
      } catch (error) {
        console.error(`Error reading discussion file: ${discussionsPath}, error: ${error}.`);
        console.log('Will download all discussions for questions');
      }
    }

    let questionsToDownload = allQuestions.map(q => ({
      titleSlug: q.titleSlug,
      questionId: q.questionId,
    }));
    if (!command.all) {
      questionsToDownload = questionsToDownload.filter(
        (question) => {
          const slug = question.titleSlug;
          return !(slug in discussions)
            || !discussions[slug].topics
            || discussions[slug].topics.length < DiscussionTopicCounts;
        },
      );
    }

    let discussionsDownloaded = 0;

    const downloadDiscussions = async (question) => {
      const questionDiscussions = {
        questionId: question.questionId,
        topics: [],
      };
      discussions[question.titleSlug] = questionDiscussions;

      const downloadTopic = async (topic) => {
        try {
          const topicDetail = await getTopicDetail(topic.node.id);
          questionDiscussions.topics.push(topicDetail);
        } catch (error) {
          console.error(error);
        }
      };

      const topics = await getQuestionTopicsList(question.questionId);
      while (topics.edges.length > 0) {
        const topic = topics.edges.shift();
        if (topic) {
          // eslint-disable-next-line no-await-in-loop
          await downloadTopic(topic);
        } else {
          console.error(`Invalid response for ${question.titleSlug}: ${topics}`);
        }
      }
    };

    try {
      while (questionsToDownload.length > 0) {
        const question = questionsToDownload.shift();
        // eslint-disable-next-line no-await-in-loop
        await downloadDiscussions(question);
        fs.writeFileSync(discussionsPath, stringify(discussions));
        discussionsDownloaded += 1;
        spinner.text = `Discussions: ${discussionsDownloaded}/${questionsToDownload.length + discussionsDownloaded}: [${question.titleSlug}] has been downloaded.`;
        // eslint-disable-next-line no-await-in-loop
        await waitForAWhile();
      }
    } catch (error) {
      console.error(error);
      // we don't abort if any download fails
      // process.exit(-1);
    }
  };

  await aux([...questions]);
  await getDiscussions();
  spinner.stop();
};

module.exports = download;
