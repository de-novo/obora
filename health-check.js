const fs = require('fs');
const path = require('path');

// Check recent execution logs
const logsDir = './experiments/overnight-builder/output/iterations/logs';
const logs = fs.readdirSync(logsDir)
  .filter(f => f.endsWith('.jsonl'))
  .map(f => {
    const stat = fs.statSync(path.join(logsDir, f));
    const lines = fs.readFileSync(path.join(logsDir, f), 'utf8').split('\n').filter(l => l.trim());
    const execEnd = lines.filter(l => l.includes('"type":"execution_end"')).pop();
    let status = 'unknown';
    let duration = 0;
    
    if (execEnd) {
      const data = JSON.parse(execEnd);
      status = data.data.status;
      const start = lines.find(l => l.includes('"type":"execution_start"'));
      if (start) {
        const startData = JSON.parse(start);
        duration = (new Date(data.ts) - new Date(startData.ts)) / 1000 / 60;
      }
    }
    
    return {
      file: f,
      size: Math.round(stat.size / 1024) + 'KB',
      modified: stat.mtime.toISOString().slice(0, 16),
      status,
      duration: Math.round(duration) + 'min'
    };
  })
  .sort((a, b) => b.modified.localeCompare(a.modified))
  .slice(0, 5);

console.log('## Recent Executions');
console.log('| Log | Size | Modified | Status | Duration |');
console.log('|-----|------|----------|--------|----------|');
logs.forEach(l => {
  console.log(`| ${l.file.slice(0, 40)} | ${l.size} | ${l.modified} | ${l.status} | ${l.duration} |`);
});

// Check TKG staging
const tkgPath = './experiments/overnight-builder/data/.obora/tkg-staging/project/overnight-builder.json';
if (fs.existsSync(tkgPath)) {
  const tkg = JSON.parse(fs.readFileSync(tkgPath, 'utf8'));
  const events = tkg.memory_events || tkg.nodes || [];
  console.log('\n## TKG Staging State');
  console.log('- Total events:', events.length);
  console.log('- Last updated:', tkg.metadata?.last_updated || 'unknown');
}

// Check workspace
const wsPath = './experiments/overnight-builder/workspace';
if (fs.existsSync(wsPath)) {
  const srcFiles = fs.readdirSync(path.join(wsPath, 'src')).length;
  const testFiles = fs.readdirSync(path.join(wsPath, 'test')).length;
  console.log('\n## Workspace Health');
  console.log('- Source files:', srcFiles);
  console.log('- Test files:', testFiles);
}
