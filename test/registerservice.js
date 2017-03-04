describe('registerservice', function () {

    it('require the module', function () {
        registerservice = require('../registerservice.js');
    });

    it('don\'t register the cluster service if there are no providers', function (done) {
        config = {};
        config.cluster = "test";
        config.service = "headnode";
        config.myhostname = "testhost";
        config.myaddress = "127.0.0.1";
        config.kvstore = {};
        config.kvstore.host = "localhost";
        config.kvstore.port = "4001";
        registerservice.registerService(config).then(function (result) {
            if (result) {
                done("the service was registered and it shouldn't have been");
            } else {
                done();
            }
        }, function (err) {
            done(err);
        });
    });

    it('register cluster service when there are providers', function (done) {
        config.providers = true;
        registerservice.registerService(config).then(function (result) {
            if (result) {
                done();
            } else {
                done("the service wasn't registered and it should have been");
            }
        }, function (err) {
            done(err);
        });
    });

});