// This module spins up a Cockroach node that can then be orchestrated
// programatically. It's limited now (not configurable at all) but could
// be extended.
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;

class Cockroach {
  constructor() {
    this.process = spawn(
      '/Users/justin/go/src/github.com/cockroachdb/cockroach/cockroach',
      ['start', '--insecure', '--logtostderr', '--vmodule=executor=2']
    );

    this.data = '';
    this.ready = new Promise(resolve => {
      this.process.stderr.on('data', data => {
        this.data += data;
        if (data.toString().includes('node startup completed')) {
          resolve(this);
        }
      });
    });

    process.on('exit', () => {
      this.close();
    });

    process.on('SIGINT', () => {
      this.close();
    });
  }

  execute(sql) {
    return new Promise((resolve, reject) => {
      exec(`
        /Users/justin/go/src/github.com/cockroachdb/cockroach/cockroach sql --insecure -e "${sql}"`, (err, stdout, stderr) => {
          if (err) {
            return reject(err);
          }
          resolve(stdout);
        }
      );
    });
  }

  close() {
    this.process.kill('SIGKILL');
  }
}

module.exports = Cockroach;

// promisified version
module.exports.spinUp = function(...args) {
  let db = new Cockroach(...args);
  return db.ready;
}
