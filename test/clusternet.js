var assert = require('assert');
var yaml = require('yamljs');
var path = require('path');
var fs = require('fs-extra');
var tmp = require('tmp');

var clusternet = null;
var ClusterNet = null;
var config = null;

describe('clusternet', function () {

    it('require the module', function () {
        clusternet = require('../clusternet.js');
    });

    it('load the test init.yml', function () {
        config = yaml.load('init.yml');
    });

    it('create an instance of ClusterNet', function () {
        ClusterNet = new clusternet(config);
    });

    it('get a list of interfaces on the machine', function (done) {
        ClusterNet.getInterfaces().then(function () {
            done();
        }, function (err) {
            done(err);
        });
    });

    it('interfaces_list is populated', function () {
        assert.ok(ClusterNet.interfaces_list);
    });

    it('active_interface is populated', function () {
        assert.ok(ClusterNet.active_interface);
    });

    it('should filter docker interface from the list', function () {
        assert.equal(true, ClusterNet.filterInterface({name: 'docker'}));
    });

    it('should filter dummy interface from the list', function () {
        assert.equal(true, ClusterNet.filterInterface({name: 'dummy'}));
    });

    it('should not filter eth0 interface from the list', function () {
        assert.equal(false, ClusterNet.filterInterface({name: 'eth0'}));
    });

    it('parse interfaces list', function () {
        assert.ok(ClusterNet.parseInterfacesList());
    });

    it('name_to_ip is populated', function () {
        assert.ok(ClusterNet.name_to_ip);
    });

    it('ip_to_name is populated', function () {
        assert.ok(ClusterNet.ip_to_name);
    });

    it('config with no saved address', function () {
        assert.equal(false, ClusterNet.hasSavedAddress());
    });

    it('config with saved address but no interface for it', function () {
        var cn = new clusternet({myaddress: "192.168.0.1"});
        cn.interfaces_list = [
            {
                name: 'eno1',
                ip_address: '172.17.4.16',
                mac_address: '78:24:af:33:28:ad',
                gateway_ip: '172.17.4.1',
                netmask: 'Mask:255.255.255.0'
            }
        ];
        cn.ip_to_name = {'172.17.4.16': 'eno1'};
        assert.equal(false, cn.hasSavedAddress());
    });

    it('config with saved address and an interface for it', function () {
        var cn = new clusternet({myaddress: "172.17.4.16"});
        cn.interfaces_list = [
            {
                name: 'eno1',
                ip_address: '172.17.4.16',
                mac_address: '78:24:af:33:28:ad',
                gateway_ip: '172.17.4.1',
                netmask: 'Mask:255.255.255.0'
            }
        ];
        cn.ip_to_name = {'172.17.4.16': 'eno1'};
        assert.ok(cn.hasSavedAddress());
    });

    it('does not have weave interface', function () {
        var cn = new clusternet();
        cn.name_to_ip = {'eno1': '172.17.4.16'};
        assert.equal(false, cn.hasWeaveInterface());
    });

    it('does have weave interface', function () {
        var cn = new clusternet();
        cn.name_to_ip = {'weave': '172.17.4.16'};
        assert.ok(cn.hasWeaveInterface());
    });

    it('does not have active interface', function () {
        var cn = new clusternet();
        assert.equal(false, cn.hasActiveInterface());
    });

    it('does have active interface', function () {
        var cn = new clusternet();
        cn.active_interface = {
            name: 'eno1',
            ip_address: '172.17.4.16',
            mac_address: '78:24:af:33:28:ad',
            gateway_ip: '172.17.4.1',
            netmask: 'Mask:255.255.255.0'
        };
        assert.ok(cn.hasActiveInterface());
    });

    it('does not have available interface', function () {
        var cn = new clusternet();
        cn.name_to_ip = {};
        assert.equal(false, cn.hasAvailableInterface());
    });

    it('does have available interface', function () {
        var cn = new clusternet();
        cn.name_to_ip = {'eno1': '172.17.4.16'};
        assert.ok(cn.hasAvailableInterface());
    });

    it('create temporary directory for next test', function () {
        var tempdir = tmp.dirSync();
        process.env['INIT_RUN_DIR'] = tempdir.name;

    });

    it('copy a test init.yml to the temporary directory', function () {
        fs.copySync(path.join(process.cwd(), 'init.yml'), path.join(process.env['INIT_RUN_DIR'], '/init.yml'));
    });

    it('can write new config file', function (done) {
        ClusterNet.writeConfig('127.0.0.1').then(function () {
            done();
        }, function (err) {
            done(err);
        });
    });

});