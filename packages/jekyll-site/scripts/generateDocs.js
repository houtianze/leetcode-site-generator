const fs = require('fs');
const path = require('path');
const problems = require('../../../problems.json');
const discussions = require('../../../discussions.json');

const convertTags = tags => tags.map(tag => `- ${tag.name} (${tag.slug})`).join('\n');

const convertCompanyTagStats = (tagStats) => {
  const tags = [];
  Object.keys(tagStats).forEach((tagIndex) => {
    tagStats[tagIndex].forEach((tag) => {
      tags.push(`- ${tag.name} - ${tag.timesEncountered} (taggedByAdmin: ${tag.taggedByAdmin})`);
    });
  });

  return tags.join('\n');
};

const epochToLocalDate = (epoch) => {
  const date = new Date(0);
  date.setUTCSeconds(epoch);
  return date;
};

const getDiscussions = (slug) => {
  const { topics } = discussions[slug];
  const posts = topics.map((topic) => {
    const str = `### ${topic.title}
- Author: ${topic.post.author.username}
- Creation Date: ${epochToLocalDate(topic.post.creationDate)}
- Update Date: ${epochToLocalDate(topic.post.updationDate)}

<p>
${topic.post.content
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\')}
</p>
`;
    return str;
  });

  return posts.join('\n\n');
};

const toDoc = ({
  title,
  titleSlug,
  lang = '',
  code,
  content,
  solution,
  topicTags,
  companyTagStats,
}) => {
  const str = (
    // eslint-disable-next-line
`---
id: "${titleSlug}"
title: "${title}"
---
## Description
<div class="description">
${content}
</div>

## Tags
${convertTags(topicTags)}

## Companies
${convertCompanyTagStats(JSON.parse(companyTagStats))}

## Official Solution
${solution ? solution.content : 'N.A.'}

## Accepted Submission (${lang || 'N.A.'})
\`\`\`${lang || ''}
${code || 'N.A.'}
\`\`\`

## Top Discussions
${getDiscussions(titleSlug)}

`
  );
  return str;
};

// so not to irate the Liquid engine in Jekyll
const patchLiquid = text => text.replace(/\{\{/g, '{ {').replace(/\{%/g, '{ %');

const docDirPath = path.join(__dirname, '..', '_docs');

if (!fs.existsSync(docDirPath)) {
  fs.mkdirSync(docDirPath);
}

problems.forEach((problem, problemIndex) => {
  const filename = `${problemIndex.toString().padStart(6, '0')}-${problem.titleSlug}.md`;
  fs.writeFile(path.join(docDirPath, filename), patchLiquid(toDoc(problem)), (err) => {
    if (err) {
      console.error(`Write ${filename} error`);
    }
  });
});

module.exports = {
  docDirPath,
};
