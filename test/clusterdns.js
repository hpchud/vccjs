var assert = require('assert');
var yaml = require('yamljs');

var clusterdns = null;
var ClusterDNS = null;
var config = null;


describe('clusterdns', function () {

    it('require the module', function () {
        clusterdns = require('../clusterdns.js');
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

    it('create an instance of ClusterDNS', function () {
        ClusterDNS = new clusterdns(config);
    });

    it('register in discovery', function (done) {
        ClusterDNS.registerName().then(function () {
            done();
        }, function (err) {
            done(err);
        });
    });

    it('lookup test host (direct)', function (done) {
        ClusterDNS.getFromKV("host", "testhost").then(function (address) {
            if (address == "127.0.0.1") {
                done();
            } else {
                done("address did not match: "+address);
            }
        })
    });

    it('lookup test host (cache - not implemented)', function (done) {
        ClusterDNS.getFromCache("testhost").then(function (address) {
            if (address == false) {
                done();
            }
        })
    });

    it('bind the server', function () {
        ClusterDNS.listen(32353);
    });

    it('lookup test host (against server)', function (done) {
        var dns = require('dns-socket');
        var socket = dns();
        socket.query({
            questions: [{
                type: 'A',
                name: 'testhost'
            }]
        }, 32353, '127.0.0.1', function (err, res) {
            if(err) {
                done(err);
            } else {
                if (res.answers[0].data == "127.0.0.1") {
                    done();
                } else {
                    done("answer was wrong:"+res);
                }
            }
        });
    });

});

describe('clusterdns privileged', function () {

    it('append to /etc/resolv.conf', function (done) {
        ClusterDNS.prependResolv().then(function () {
            done();
        }, function (err) {
            done(err);
        });
    });

});