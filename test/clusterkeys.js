var assert = require('assert');
var yaml = require('yamljs');
var path = require('path');
var fs = require('fs-extra');
var tmp = require('tmp');

var clusterkeys = null;
var ClusterKeys = null;
var config = null;

describe('clusterkeys', function () {

    it('require the module', function () {
        clusterkeys = require('../clusterkeys.js');
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

});