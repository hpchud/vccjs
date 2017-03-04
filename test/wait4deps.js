var assert = require('assert');
var path = require('path');
var yaml = require('yamljs');

var wait4deps = null;
var Wait4Deps = null;
var config = null;

describe('wait4deps', function () {

    it('require the module', function () {
        wait4deps = require('../wait4deps.js');
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

    it('create an instance of Wait4Deps', function () {
        Wait4Deps = new wait4deps(config);
        Wait4Deps.hook_dir = path.join(process.cwd(), 'test');
    });

    it('try and load none existing dependencies.yml', function (done) {
        Wait4Deps.depfile = path.join(process.cwd(), 'test/doesntexist.yml');
        Wait4Deps.readDependencies().then(function () {
            done("There shouldn't be a dependency file but there is.....");
        }, function (err) {
            done();
        });
    });

    it('try and load dependencies.yml with no service set', function (done) {
        Wait4Deps.depfile = path.join(process.cwd(), 'test/dependencies.yml');
        Wait4Deps.readDependencies().then(function () {
            done("should have caught the fact that me.config.service is undefined");
        }, function (err) {
            if (err === "Dependency file does not define our service") {
                done();
            } else {
                done(err);
            }
        });
    });

    it('try and load dependencies.yml that does not define our service', function (done) {
        Wait4Deps.config.service = "notourservice";
        Wait4Deps.readDependencies().then(function () {
            done("should have caught the fact that me.config.service isn't in the file");
        }, function (err) {
            if (err === "Dependency file does not define our service") {
                done();
            } else {
                done(err);
            }
        });
    });

    it('load the dependencies.yml for service with no dependencies', function (done) {
        Wait4Deps.config.service = "headnode";
        Wait4Deps.readDependencies().then(function () {
            done();
        }, function (err) {
            done(err);
        });
    });

    it('this.config.providers should be populated', function () {
        assert.ok(Wait4Deps.config.providers);
    });

    it('load the dependencies.yml for service with dependencies', function (done) {
        Wait4Deps.config.providers = null;
        Wait4Deps.config.service = "workernode";
        Wait4Deps.readDependencies().then(function () {
            done();
        }, function (err) {
            done(err);
        });
    });

    it('this.config.depends should be populated', function () {
        assert.ok(Wait4Deps.config.depends);
    });

    it('prefill discovery KV store with a fulfilled cluster service', function (done) {
        Wait4Deps.kv.set('/cluster/test/services/headnode', 'testheadnode').then(function () {
            done();
        }, function (err) {
            done(err);
        });
    });

    it('get service from discovery KV store', function (done) {
        Wait4Deps.getServiceFromKV('headnode').then(function (service) {
            if (service[1] == false) {
                done("did not get the service from the discovery KV store");
            } else {
                done();
            }
        });
    });

    it('wait for dependencies', function (done) {
        this.timeout(10000);
        Wait4Deps.waitForDependencies().then(function () {
            done()
        }, function (err) {
            done(err);
        });
    });

    it('this.depends should be populated', function () {
        assert.ok(Wait4Deps.depends);
    });

    it('run test hook', function (done) {
        Wait4Deps.runHook('headnode', 'testhost').then(function (code) {
            if (code == 0) {
                done();
            } else {
                done("code was > 0");
            }
        });
    });

    it('run service hooks through function', function (done) {
        Wait4Deps.runServiceHooks().then(function (code) {
            done(code);
        }, function (err) {
            done(err);
        });
    });

});