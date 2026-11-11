const fs = require('fs');
const path = require('path');
const db = require('../db');

const expansionFile = path.join(__dirname, 'lesson15-16-content-expansion.json');
const expansions = JSON.parse(fs.readFileSync(expansionFile, 'utf8'));
const expansionMarker = '<!-- lesson15-16-content-expansion-v1 -->';

function lessonCode(title) {
  const match = title.match(/^(?:L|Lesson )?(15|16)\.(\d+)\b/i);
  return match ? `L${match[1]}.${Number(match[2])}` : null;
}

function validateExpansions() {
  const expectedCodes = [
    ...Array.from({ length: 10 }, (_, index) => `L15.${index + 1}`),
    ...Array.from({ length: 10 }, (_, index) => `L16.${index + 1}`)
  ];
  for (const code of expectedCodes) {
    if (!Array.isArray(expansions[code]) || expansions[code].length !== 3 ||
        expansions[code].some((paragraph) => !/^<p>.*<\/p>$/.test(paragraph))) {
      throw new Error(`${code} must contain exactly three HTML paragraphs.`);
    }
  }
}

async function seed() {
  validateExpansions();
  const connection = await db.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const [parents] = await connection.query(
      'SELECT id, title FROM topics WHERE parent_topic_id IS NULL AND (title LIKE ? OR title LIKE ?) FOR UPDATE',
      ['L15%', 'L16%']
    );
    const parentIds = new Map(
      parents.map((parent) => [parent.title.match(/^L(15|16)\b/)?.[1], parent.id])
    );
    if (parentIds.size !== 2) {
      throw new Error(`Expected one L15 parent and one L16 parent, found ${parentIds.size}.`);
    }

    const [topics] = await connection.query(
      'SELECT id, parent_topic_id, title, content FROM topics WHERE parent_topic_id IN (?, ?) FOR UPDATE',
      [parentIds.get('15'), parentIds.get('16')]
    );
    const seenCodes = new Set();
    let updated = 0;
    let skipped = 0;
    for (const topic of topics) {
      const code = lessonCode(topic.title);
      if (!code || !expansions[code] || topic.parent_topic_id !== parentIds.get(code.slice(1, 3))) continue;
      if (seenCodes.has(code)) throw new Error(`Multiple topics match ${code}.`);
      seenCodes.add(code);
      if (topic.content.includes(expansionMarker)) {
        skipped++;
        continue;
      }
      const content = `${topic.content}\n${expansionMarker}\n${expansions[code].join('\n')}`;
      await connection.query('UPDATE topics SET content = ? WHERE id = ?', [content, topic.id]);
      updated++;
      console.log(`Appended three paragraphs to ${code} (${topic.id}): ${topic.title}`);
    }

    for (const code of Object.keys(expansions)) {
      if (!seenCodes.has(code)) throw new Error(`No matching topic found for ${code}.`);
    }
    await connection.commit();
    transactionStarted = false;
    console.log(`Lesson content expansion complete: ${updated} updated, ${skipped} already expanded.`);
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

seed()
  .catch((error) => {
    console.error('Lesson 15/16 content seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(() => db.end());
