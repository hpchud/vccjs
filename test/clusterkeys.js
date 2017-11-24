var assert = require('assert');
var yaml = require('yamljs');
var path = require('path');
var fs = require('fs-extra');
var tmp = require('tmp');

var clusterkeys = null;
var ClusterKeys = null;
var config = null;
var publickey = null;
var enumeratekeys = null;

describe('clusterkeys', function () {

    it('require the module', function () {
        clusterkeys = require('../clusterkeys.js');
    });

    it('load the test init.yml', function () {
        config = yaml.load('cluster.yml');
        config.cluster = "test";
        config.myhostname = "testhost";
        config.myaddress = "127.0.0.1";
        config.kvstore = {};
        config.kvstore.host = "localhost";
        config.kvstore.port = "4001";
    });

    it('create an instance of ClusterKeys', function () {
        ClusterKeys = new clusterkeys(config);
    });

    it('delete private key from previous test if exists', function (done) {
        fs.stat(path.join(__dirname, "id_rsa"), function (err, stats) {
            if (err) {
                done(err);
            }
            fs.unlink(path.join(__dirname, "id_rsa"), function (err) {
                if (err) {
                    done(err);
                }
                done();
            });
        });
    });

    it('delete public key from previous test if exists', function (done) {
        fs.stat(path.join(__dirname, "id_rsa.pub"), function (err, stats) {
            if (err) {
                done(err);
            }
            fs.unlink(path.join(__dirname, "id_rsa.pub"), function (err) {
                if (err) {
                    done(err);
                }
                done();
            });
        });
    });

    it('generate public and private keys', function (done) {
        ClusterKeys.generateKeys(__dirname).then(function (generated) {
            if (generated) {
                done();
            } else {
                done('key already exists but it shouldnt');
            }
        }, function (err) {
            done(err);
        });
    });

    it('publish public key to discovery', function (done) {
        ClusterKeys.publishKeys(__dirname).then(function () {
            done();
        }, function (err) {
            done(err);
        });
    });

    it('read in the generated public key', function (done) {
        fs.readFile(path.join(__dirname, "id_rsa.pub"), 'utf8', function (err, public_key) {
            if (err) {
                done('Could not open public key file '+err);
            }
            publickey = public_key.trim();
            done();
        });
    });

    it('enumerate keys in discovery', function (done) {
        ClusterKeys.enumeratePublicKeys().then(function (keys) {
            enumeratekeys = keys;
            done();
        }, function (err) {
            done(err);
        });
    });

    it('check that the generated public key was written to discovery correctly', function (done) {
        if (enumeratekeys[config.myhostname] == publickey) {
            done();
        } else {
            done('do not match');
        }
    });
    
    it('write the authorized_keys file', function (done) {
        ClusterKeys.writeAuthorizedKeys(__dirname).then(function () {
            done();
        }, function (err) {
            done(err);
        });
    });
    
    it('run an iteration of watchCluster()', function (done) {
        this.timeout(10000);
        ClusterKeys.settle_ms = 1000;
        ClusterKeys.watchCluster(done);
    });
    
    it('check that the authorized_keys file was written correctly', function (done) {
        fs.readFile(path.join(__dirname, "authorized_keys"), 'utf8', function (err, authorized_key) {
            if (err) {
                done('Could not open authorized_keys file '+err);
            }
            if (authorized_key.trim() == publickey) {
                done();
            } else {
                done('do not match');
            }
        });
    });

});