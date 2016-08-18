#!/usr/bin/env node

var os = require("os");
var path = require("path");
var network = require("network");
var promise = require("deferred");

var logger = require("./log.js");
var kvstore = require("./kvstore.js");

var dgram = require('dgram');
var ndns = require('./ndns.js');


var ClusterDNS = function (config) {
    // load the config file
    this.config = config;
    logger.info("ClusterDNS initialised with config", config);
    // open kvstore
    this.store = new kvstore(config);
    // start up the server
    this.server = ndns.createServer('udp4');
    this.client = ndns.createClient('udp4');
    this.server.on("request", (this.handleQuery).bind(this));
    this.server.bind(53, "127.0.0.1");
    //this.client.bind();
}

ClusterDNS.prototype.handleQuery = function (req, res) {
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
    // look for record in kvstore for this name
    var raddress = this.store.get("/cluster/"+this.config.cluster+"/hosts/"+qname);
    if (!raddress) {
        var found = false;
        // see if address is a service name, and resolve to service host
        var services = this.store.list("/cluster/"+this.config.cluster+"/services");
        for (var i = services.length - 1; i >= 0; i--) {
            if (path.basename(services[i].key) == qname) {
                // get the record for the host providing this service
                var raddress = this.store.get("/cluster/"+this.config.cluster+"/hosts/"+services[i].value);
                if (!raddress) {
                    logger.error("ClusterDNS could not find the host for service", path.basename(services[i].key));
                    res.send();
                    return;
                } else {
                    found = true;
                }
                break;
            }
        };
        // else reject
        if (!found) {
            logger.warn("ClusterDNS has no record for", qname, ", rejecting");
            res.send();
            return;
        }
    }
    // prepare response
    logger.info("ClusterDNS looked up", qname, "to", raddress);
    res.header.qr = 1;
    res.header.ra = 1;
    res.header.rd = 0;
    res.header.ancount = 1;
    res.header.nscount = 0;
    res.header.arcount = 0;
    res.addRR(qname, 1, "IN", "A", raddress);
    res.send();
}

module.exports = {
    ClusterDNS: function (service, config, targets) {
        var deferred = promise();
        var clusterdns = new ClusterDNS(config.cluster);
        deferred.resolve();
        return deferred.promise();
    }
};