const { compileFromFile } = require('json-schema-to-typescript');
const fs = require('fs');
const path = require('path');

async function generate() {
  const schemaPath = path.resolve(__dirname, '../../../spec/schema.json');
  const outputPath = path.resolve(__dirname, '../src/types/generated.ts');
  const ts = await compileFromFile(schemaPath);
  fs.writeFileSync(outputPath, ts);
  console.log('Types generated successfully.');
}
generate();
