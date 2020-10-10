const { GraphQLClient } = require('graphql-request');
const nodeUrl = require('url');
const ora = require('ora');
const inquirer = require('inquirer');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

const {
  request,
  getHeaders,
  unicodeToChar,
  removeConfig,
  getConfig,
  setConfig,
} = require('./utils');

puppeteer.use(StealthPlugin());


const { country } = getConfig();

const usUrl = 'https://leetcode.com';
const cnUrl = 'https://leetcode-cn.com';
const baseUrl = country === 'us' ? usUrl : cnUrl;
const graphqlUrl = `${baseUrl}/graphql`;

const login = async () => {
  let loginUrl = baseUrl;
  if (country === undefined) {
    loginUrl = (await inquirer.prompt({
      name: 'baseUrl',
      type: 'list',
      message: 'Log in to:',
      choices: [usUrl, cnUrl],
    })).baseUrl;
    setConfig({ country: loginUrl === cnUrl ? 'cn' : 'us' });
  }
  loginUrl += '/accounts/login/';

  const spinner = ora('Login...').start();
  try {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto(loginUrl);
    await page.waitForFunction('window.location.href.indexOf("login") === -1');
    let cookies = await page.cookies();
    await browser.close();
    spinner.stop();
    cookies = cookies.reduce((acc, cookie) => {
      const { name } = cookie;
      acc[name] = cookie;
      return acc;
    }, {});
    setConfig({ cookies });
    return cookies;
  } catch (error) {
    console.error('Login failure, retry...', error.message);
    throw error;
  } finally {
    spinner.stop();
  }
};

const getCookie = async () => { // eslint-disable-line
  try {
    const { cookies } = getConfig();
    const { LEETCODE_SESSION } = cookies;
    if (!LEETCODE_SESSION
    || (new Date(LEETCODE_SESSION.expires) <= new Date().getTime() / 1000)
    ) {
      console.error('Cookie expires, retry...');
      removeConfig('cookies');
      return getCookie();
    }
    return Object.keys(cookies).reduce((acc, name) => {
      acc[name] = cookies[name].value;
      return acc;
    }, {});
  } catch (error) {
    const cookies = await login();
    return cookies;
  }
};

const createGqlRequest = async () => {
  const cookies = await getCookie();
  const client = new GraphQLClient(graphqlUrl, {
    headers: getHeaders(cookies),
  });
  return client.request.bind(client);
};

const createRequest = async () => {
  const cookies = await getCookie();
  return url => request(url, {
    headers: getHeaders(cookies),
  });
};

const getAllQuestions = async () => {
  const gqlRequest = await createGqlRequest();
  const spinner = ora('Fetching all questions...').start();
  const json = await gqlRequest(`{
    allQuestions{
      questionId
      title
      titleSlug
      status
      content
    }
  }`);
  spinner.stop();
  return json.allQuestions || [];
};

const getAllACQuestions = async () => {
  const allQuestions = await getAllQuestions();
  const filterAcQuestions = (questions = []) => questions.filter(({
    status,
  }) => status === 'ac');
  return filterAcQuestions(allQuestions);
};

const acCodeQuery = (questionSlug) => {
  const query = `{
    submissionList(offset:0,limit:10, questionSlug: "${questionSlug}"){
      submissions{
        lang
        title
        url
        statusDisplay
        id
      }
    }
  }`;
  return query;
};

const questionDetailQuery = (titleSlug) => {
  const query = `{
    question(titleSlug: "${titleSlug}") {
      questionId
      questionFrontendId
      boundTopicId
      title
      titleSlug
      content
      translatedTitle
      translatedContent
      isPaidOnly
      difficulty
      likes
      dislikes
      isLiked
      similarQuestions
      contributors {
        username
        profileUrl
        avatarUrl
        __typename
      }
      topicTags {
        name
        slug
        translatedName
        __typename
      }
      companyTagStats
      codeSnippets {
        lang
        langSlug
        code
        __typename
      }
      stats
      hints
      solution {
        id
        content
        contentTypeId
        canSeeDetail
        paidOnly
        rating {
          id
          count
          average
          userRating {
            score
            __typename
          }
          __typename
        }
        __typename
      }
      status
      sampleTestCase
      metaData
      judgerAvailable
      judgeType
      mysqlSchemas
      enableRunCode
      enableTestMode
      enableDebugger
      envInfo
      libraryUrl
      adminUrl
      __typename
    }
  }
  `;
  return query;
};

const questionTopicsListQuery = (questionId) => {
  const query = `{
    questionTopicsList(questionId: ${questionId}, orderBy: "most_votes", skip: 0, query: "", first: 15, tags: []) {
      ...TopicsList
      __typename
    }
  }

  fragment TopicsList on TopicConnection {
    totalNum
    edges {
      node {
        id
        title
        commentCount
        viewCount
        pinned
        tags {
          name
          slug
          __typename
        }
        post {
          id
          voteCount
          creationDate
          isHidden
          author {
            username
            isActive
            profile {
              userSlug
              userAvatar
              __typename
            }
            __typename
          }
          status
          coinRewards {
            ...CoinReward
            __typename
          }
          __typename
        }
        lastComment {
          id
          post {
            id
            author {
              isActive
              username
              profile {
                userSlug
                __typename
              }
              __typename
            }
            peek
            creationDate
            __typename
          }
          __typename
        }
        __typename
      }
      cursor
      __typename
    }
    __typename
  }

  fragment CoinReward on ScoreNode {
    id
    score
    description
    date
    __typename
  }
  `;
  return query;
};

const topicQuery = (topicId) => {
  const query = `{
    topic(id: ${topicId}) {
      id
      viewCount
      topLevelCommentCount
      subscribed
      title
      pinned
      tags
      hideFromTrending
      post {
        ...DiscussPost
        __typename
      }
      __typename
    }
  }

  fragment DiscussPost on PostNode {
    id
    voteCount
    voteStatus
    content
    updationDate
    creationDate
    status
    isHidden
    coinRewards {
      ...CoinReward
      __typename
    }
    author {
      isDiscussAdmin
      isDiscussStaff
      username
      profile {
        userAvatar
        reputation
        userSlug
        __typename
      }
      isActive
      __typename
    }
    authorIsModerator
    isOwnPost
    __typename
  }

  fragment CoinReward on ScoreNode {
    id
    score
    description
    date
    __typename
  }`;
  return query;
}

const getSubmissionCode = async ({ url, id } = {}, isUS = true) => {
  if (isUS) {
    const submissionUrl = nodeUrl.resolve(baseUrl, url);
    const requestWithSession = await createRequest(submissionUrl);
    const response = await requestWithSession(submissionUrl);
    // NOTE unreliable
    const matches = response.body.match(/submissionCode\s*:\s*'([\s\S]*)'\s*,\s*editCodeUrl/);
    if (matches[1]) {
      return unicodeToChar(matches[1]);
    }
  }
  const gqlRequest = await createGqlRequest();
  const json = await gqlRequest(`{
    submissionDetail(submissionId: ${id}) {
      id
      code
      statusDisplay
    }
  }`);
  const detail = json.submissionDetail || {};
  return detail.code;
};

const getAcCode = async (questionSlug) => {
  const qglRequest = await createGqlRequest();
  const json = await qglRequest(acCodeQuery(questionSlug));
  const submissions = (json.submissionList && json.submissionList.submissions) || [];
  const acSubmissions = submissions.filter(({
    statusDisplay,
  }) => statusDisplay === 'Accepted');
  if (acSubmissions.length > 0) {
    const code = await getSubmissionCode(acSubmissions[0], country === 'us');
    return {
      code,
      ...acSubmissions[0],
    };
  }
  return null;
};

const getQuestionDetail = async (titleSlug) => {
  const qglRequest = await createGqlRequest();
  const json = await qglRequest(questionDetailQuery(titleSlug));
  return json.question;
};

const getQuestionTopicsList = async (questionId) => {
  const qglRequest = await createGqlRequest();
  const json = await qglRequest(questionTopicsListQuery(questionId));
  return json.questionTopicsList;
};

const getTopicDetail = async (topicId) => {
  const qglRequest = await createGqlRequest();
  const json = await qglRequest(topicQuery(topicId));
  return json.topic;
};

module.exports = {
  login,
  getAllQuestions,
  getAllACQuestions,
  getAcCode,
  getQuestionDetail,
  getQuestionTopicsList,
  getTopicDetail,
  getCookie,
};
