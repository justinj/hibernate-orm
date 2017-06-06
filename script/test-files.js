var walk = require('walk');
var fs = require('fs');

let startTime = +new Date();

let walker = walk.walk('./hibernate-core/src/test/java/org/hibernate');

let isTestFile = name => name.match(/Test\.java$/);

let isTestLine = line => line.match(/public void test/);
let testName = line => line.match(/test\w*/)[0];
let isAutoIgnore = line => line.match(/@Ignore\("ignored by justins amazing tool"\)/) != null;


let skippedTestsList = fs.readFileSync(__dirname + '/ignored-tests').toString().trim().split('\n');
let skippedTests = new Set(skippedTestsList);

let shouldBeSkipped = name => skippedTests.has(name);

let rootDir = '\./hibernate-core/src/test/java/org/hibernate';

function currentlyIgnoredTests() {
  return new Promise((resolve) => {
    let walker = walk.walk(rootDir);

    walker.on('file', (root, stats, next) => {
      let testIdentifier = root.replace(rootDir, '').replace(/^\//, '') + '.' + stats.name;
      console.log(testIdentifier);
      next();
    });

    walker.on('end', () => {

    });
  });
}

function ignoreTest(state, testId) {
  if (state.ignored.has(testId)) {
    return;
  }
  state.ignored.add(testId);
  let [dir, testName] = testId.split('.');
  let fname = rootDir + '/' + dir + '.java';

  console.log(fname);
}

let state = {
  ignored: new Set()
};

ignoreTest(state, 'jpa/test/callbacks/CallbackAndDirtyTest.testDirtyButNotDirty');

console.log(state);

// function rewriteFile(fname) {
//   let result = [];
//   let contents = fs.readFileSync(fname).toString();
//   let lines = contents.split('\n');
//   for (let l of lines) {
//     if (isAutoIgnore(l)) {
//       continue;
//     } else if (isTestLine(l)) {
//       if (shouldBeSkipped(testName(l))) {
//         let whitespace = (l.match(/^\s+/) || [''])[0];
//         result.push(whitespace + '@Ignore("ignored by justins amazing tool")');
//       }
//     }
//     result.push(l);
//   }
//   fs.writeFileSync(fname, result.join('\n'));
// }

// // walker.on('file', (root, stats, next) => {
// //   if (isTestFile(stats.name)) {
// //     rewriteFile(`${root}/${stats.name}`);
// //   }
// //   next();
// // });

// // walker.on('end', () => {
// //   let time = (+new Date() - startTime) / 1000;
// //   console.log('🍕  finished in ' + time + 's!');
// // });

