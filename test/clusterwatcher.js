var assert = require('assert');
var path = require('path');
var yaml = require('yamljs');
var tmp = require('tmp');
var fs = require ('fs');
var file_compare = require('file-compare');

var clusterwatcher = null;
var ClusterWatcher = null;
var config = null;

describe('clusterwatcher', function () {

    it('require the module', function () {
        clusterwatcher = require('../clusterwatcher.js');
    });

    it('load the test init.yml', function () {
        config = yaml.load('init.yml');
        config.cluster = "test";
        config.myhostname = "testhost";
        config.myaddress = "127.0.0.1";
        config.kvstore = {};
        config.kvstore.host = "localhost";
        config.kvstore.port = "4001";
    });

    it('create an instance of ClusterWatcher', function () {
        ClusterWatcher = new clusterwatcher(config);
        ClusterWatcher.hook_dir = path.join(process.cwd(), 'test/*.sh');
    });

    it('prefill the discovery KV store with some test data', function (done) {
        ClusterWatcher.kv.set('/cluster/test/hosts/testhost', '127.0.0.1').then(function () {
            done();
        }, function (err) {
            done(err);
        });
    });

    it('create a temporary file for the next test', function () {
        var tempfile = tmp.fileSync();
        ClusterWatcher.host_path = tempfile.name;
    });

    it('write a hosts file', function (done) {
        ClusterWatcher.writeHosts({'testhost': '127.0.0.1'}).then(function () {
            done();
        }, function (err) {
            done(err);
        });
    });

    it('check that the written host file is correct', function (done) {
        file_compare.compare(path.join(process.cwd(), 'test/hosts.vcc'), ClusterWatcher.host_path, function (result) {
            if (result) {
                done();
            } else {
                done("files did not match");
            }
        });
    });

    it('run test hook', function (done) {
        ClusterWatcher.runHook(path.join(process.cwd(), 'test/headnode.sh')).then(function (code) {
            if (code == 0) {
                done();
            } else {
                done("code was > 0");
            }
        });
    });

    it('run cluster hooks through function', function (done) {
        ClusterWatcher.runClusterHooks().then(function (code) {
            done(code);
        }, function (err) {
            done(err);
        });
    });

    it('run an iteration of watchCluster()', function (done) {
        this.timeout(10000);
        ClusterWatcher.settle_ms = 1000;
        ClusterWatcher.watchCluster(done);
    });

});