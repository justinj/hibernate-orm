var rimraf = require('rimraf-promise');
var util = require('util');
var spawn = require('child_process').spawn;
var walk = require('walk');
var fs = require('fs');
var path = require('path');

var Cockroach = require('./cockroach');

const TIMEOUT = 1000 * 60 * 1/6;

function testSuite(testName) {
  let process = spawn(
    './gradlew', [
     'hibernate-core:matrix_crdb',
     `-Dmatrix_crdb.single=${testName}`,
     '--rerun-tasks'
    ]);
  return new Promise((resolve, reject) => {
    let stdout = '';

    let timeout = setTimeout(() => {
      process.kill('SIGKILL');
      resolve('TEST TIMED OUT - STDOUT: \n' + stdout);
    }, TIMEOUT);

    process.stdout.on('data', data => {
      let s = data.toString();
      // for some reason we sometimes don't seem to get the 'close' event...
      // so this is a hack
      stdout += s;
    });

    let stderr = '';
    process.stderr.on('data', data => {
      stderr += data.toString();
    });

    process.on('close', code => {
      if (code === 0) {
        clearTimeout(timeout);
        resolve(stdout);
      } else {
        reject(new Error(`Test suite exited with code ${code}, stdout: ${stdout}, stderr: ${stderr}`));
      }
    });
  });
}

function runTest(test) {
  console.log(`running ${test}`);
  return rimraf('cockroach-data').then(() => {
    return Cockroach.spinUp();
  }).then(db => {
    return db.execute(`
      DROP DATABASE IF EXISTS hibernate_orm_test;
      CREATE DATABASE hibernate_orm_test;
      CREATE USER hibernate_orm_test;
      GRANT ALL ON DATABASE hibernate_orm_test TO hibernate_orm_test`
    ).then(() => {
      return testSuite(test);
    }).then(gradleStdout => {
      db.close();
      return {
        cockroachLogs: db.data,
        gradleLogs: gradleStdout
      };
    });
  });
}

function getFilename(testClass) {
  let walker = walk.walk(__dirname + '/../hibernate-core/src/test/');
  return new Promise((resolve, reject) => {
    walker.on('file', (root, stats, next) => {
      if (stats.name === testClass.replace(/class$/, 'java')) {
        resolve(root + '/' + stats.name);
      } else {
        next();
      }
    });
    walker.on('end', () => reject(new Error(`Couldn't find ${testClass}!`)));
  });
}

const classes = require('./failing-tests');

function forEachAsync(l, f) {
  if (l.length > 0) {
    f(l[0]).then(() => {
      forEachAsync(l.slice(1), f);
    });
  }
}

rimraf('test-failures').then(() => {
  fs.mkdirSync('test-failures');

  forEachAsync(classes, className => {
    return getFilename(className).then(filename => {
      let testName = filename.replace(/^.*org\/hibernate\/(jpa\/)?test\//, '').replace(/\.java$/, '');
      return runTest(testName);
    }).catch(err => {
      return {
        cockroachLogs: 'TEST ERRORED',
        gradleLogs: err
      };
    }).then(({cockroachLogs, gradleLogs}) => {
      fs.mkdirSync(`test-failures/${className}`);
      fs.writeFileSync(`test-failures/${className}/cockroach-logs`, cockroachLogs);
      fs.writeFileSync(`test-failures/${className}/gradle-logs`, gradleLogs);
    });
  });
});
