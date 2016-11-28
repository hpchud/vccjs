#!/usr/bin/env node

var os = require("os");
var prependFile = require('prepend-file');
var path = require("path");
var network = require("network");
var promise = require("deferred");

var vccutil = require("./vccutil.js");
var logger = require("./log.js");
var kvstore = require("./kvstore.js");

var dgram = require('dgram');
var ndns = require('./ndns.js');


var config = vccutil.getConfig();
logger.info("ClusterDNS initialised with config", config);


var cache = {};
var cache_ttl = 60;

// connect kv store
var kv = new kvstore();
kv.connect(config.kvstore.host, config.kvstore.port);


var registerName = function () {
    var key = "/cluster/"+config.cluster+"/hosts/"+config.myhostname;
    kv.register(key, config.myaddress, 60);
}

var prependResolv = function () {
    var deferred = promise();
    // this function adds ourself to the top of /etc/resolv.conf
    prependFile('/etc/resolv.conf', 'nameserver 127.0.0.1\n', function(err) {
        if (err) {
            deferred.reject(err);
        }
        deferred.resolve();
    });
    return deferred.promise();
}

var completeQuery = function (raddress, qname, res) {
    // prepare response
    logger.info("ClusterDNS looked up to", raddress);
    res.header.qr = 1;
    res.header.ra = 1;
    res.header.rd = 0;
    res.header.ancount = 1;
    res.header.nscount = 0;
    res.header.arcount = 0;
    res.addRR(qname, 1, "IN", "A", raddress);
    res.send();
}

var getFromCache = function (qname) {
    var deferred = promise();
    // no cache for now
    deferred.resolve(false);
    return deferred.promise();
}

var getFromKV = function (type, qname) {
    // the purpose of this promise is to handle a rejection from the kv store promise
    // because any error occured will reject the 'some' lookup promise
    // it should also resolve the service name to host if applicable
    var deferred = promise();
    if (type == "host") {
        var key = "/cluster/"+config.cluster+"/hosts/"+qname;
    } else if (type == "service") {
        var key = "/cluster/"+config.cluster+"/services/"+qname;
    }
    // do the get from kv store
    kv.get(key).then(function (value) {
        // if this lookup was for type host, we are done
        if (type == "host") {
            // update the cache here too
            deferred.resolve(value);
        } else if (type == "service") {
            // we need to do another getFromKV of type host
            // because value is the name of the host providing this service!
            getFromKV("host", value).then(function (hostanswer) {
                // we are done
                // update the cache here too
                deferred.resolve(hostanswer);
            }, function (err) {
                logger.warn("got an error with nested getFromKV for service", qname);
                logger.warn(err);
                deferred.resolve(false);
            });
        }
    }, function (err) {
        deferred.resolve(false);
    });
    return deferred.promise();
}

var handleQuery = function (req, res) {
    var resolved = false;
    res.setHeader(req.header);
    // check we only got 1 question in this query
    if(req.q.length > 1) {
        logger.warn("ClusterDNS got query with more than 1 question, rejecting");
        res.send();
        return;
    }
    // find the query name
    res.addQuestion(req.q[0]);
    var qname = req.q[0].name;
    logger.debug("ClusterDNS got a query for", qname);

    // execute promises in parallel for each possible lookup option
    // if the kvstore responds faster than our cache, so be it
    promise.some([
        getFromCache(qname.replace("vnode_", "")),
        getFromKV("host", qname.replace("vnode_", "")),
        getFromKV("service", qname)
    ], function (raddress) {
        if (raddress) {
            logger.debug("a promise resolved this address to", raddress);
            completeQuery(raddress, qname, res);
            resolved = true;
            // stop further processing
            return true;
        }
    }).then(function () {
        if (!resolved) {
            logger.debug("could not look up this query");
            res.send();
        }
    });
};

if (!config.nodns) {
    // start the dns server
    var server = ndns.createServer('udp4');
    server.on("request", handleQuery);
    server.bind(53, "127.0.0.1");
    logger.info("ClusterDNS is listening on port 53");
    // prepend ourself to /etc/resolv.conf
    prependResolv().then(function () {
        logger.info("appended 127.0.0.1 to /etc/resolv.conf");
    }, function (err) {
        logger.error("could not prepend /etc/resolv.conf", err);
    });
} else {
    logger.warn("Not using ClusterDNS service, make sure an alternative for name resolution is available.");
}

// register our name
registerName();