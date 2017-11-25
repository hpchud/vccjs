var logger = require("./log.js");
var fs = require('fs');
var path = require('path');
var yaml = require('yamljs');
var promise = require("deferred");
var notify = require('systemd-notify');

exports.systemdNotify = function (status, ready) {
    var deferred = promise();
    var config = exports.getConfig();
    if (config.systemd) {
        notify({
            ready: ready,
            status: status
            },
            function(err) {
                if (err) {
                    deferred.reject(err);
                } else {
                    deferred.resolve();
                }
            }
        );
    }
    return deferred.promise;
}

exports.getRunDir = function () {
    // the run dir where we can find init.yml is in env VCC_RUN_DIR
    var run_dir = process.env['VCC_RUN_DIR'];
    if (!run_dir) {
        logger.warn('No environment variable VCC_RUN_DIR.... assuming /run');
        run_dir = '/run';
    }
    return run_dir;
}

exports.getConfig = function (full, run_dir) {
    if (!run_dir) {
        var run_dir = exports.getRunDir();
    }
    return yaml.load(path.join(run_dir, 'cluster.yml'));
}

exports.writeConfig = function (newconfig) {
    var deferred = promise();
    var run_dir = exports.getRunDir();
    fs.writeFile(path.join(run_dir, 'cluster.yml'), yaml.stringify(newconfig), function (err) {
        if (err) {
            deferred.reject(err);
        }
        deferred.resolve();
    });
    return deferred.promise;
}
