var path = require('path');

var config = {
	service: 'test'
};

describe('loadtargets', function () {

    it('require the module', function () {
        loadtargets = require('../loadtargets.js');
    });

    it('load the test target', function (done) {
    	// set path for service files to test folder
    	loadtargets.servicePath = path.join(process.cwd(), 'test');
    	// function doesn't need service or targets objects, just config object
    	loadtargets['LoadTargets']({}, config, {}, console.log).then(function () {
    		done();
    	}, function (err) {
    		done(err);
    	});
    });

});