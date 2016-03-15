"use strict";

var HyperSwitch = require('hyperswitch');
var HTTPError = HyperSwitch.HTTPError;
var URI = HyperSwitch.URI;
var P = require('bluebird');

function copyForwardedHeaders(req, rootReq, headersLins) {
    if (rootReq.headers) {
        req.headers = req.headers || {};
        headersLins.forEach(function(header) {
            if (!req.headers[header] && rootReq.headers[header]) {
                req.headers[header] = rootReq.headers[header];
            }
        });
    }
    return req;
}

function checkPermissions(hyper, req, permissions) {
    return hyper.post({
        uri: new URI([req.params.domain, 'sys', 'action', 'query']),
        method: 'post',
        body: {
            meta: 'userinfo',
            uiprop: 'rights'
        }
    })
    .then(function(userInfo) {
        userInfo = userInfo.body;
        if (userInfo && userInfo.rights && Array.isArray(userInfo.rights)) {
            permissions.forEach(function(perm) {
                if (userInfo.rights.indexOf(perm) < 0) {
                    throw new HTTPError({
                        status: 401,
                        body: {
                            type: 'unauthorized',
                            title: 'Not authorized to access the resource',
                            description: 'Need permission ' + perm
                        }
                    });
                }
            });
        } else {
            throw new HTTPError({
                status: 400,
                body: {
                    type: 'invalid_request',
                    title: 'Failed to check permissions for the request'
                }
            });
        }
    });
}

module.exports = function(hyper, req, next, options) {
    if (hyper._isSysRequest(req)) {
        return next(hyper, req);
    }

    copyForwardedHeaders(hyper.ctx, req,
        ['cookie', 'x-forwarded-for', 'x-client-ip']);

    if (!options.permissions || !options.permissions.length) {
        return next(hyper, req);
    }

    if (req.method === 'get' || req.method === 'head') {
        return P.all([
            next(hyper, req),
            checkPermissions(hyper, req, options.permissions)
        ])
        .spread(function(res) { return res; });
    } else {
        return checkPermissions(hyper, req, options.permissions)
        .then(function() {
            return next(hyper, req);
        });
    }
};