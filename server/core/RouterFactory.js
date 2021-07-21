const Helper = require("./Helper");

class RouterFactory {
    get pathModule() {
        return require("path");
    }

    constructor(params = {}) {
        if (!params) {
            throw new SyntaxError("[RouterFactory]: params is not defined");
        }

        this.CALLBACK_PROP = Helper.wrapLikeNotRoute("callbacks");
        this.PARAM_PROP = Helper.wrapLikeNotRoute("param");
        this.subdomain = params.subdomain || ""
        this.SemanticURLs = params.SemanticURLs || {};

        this.path = params.path || this.pathModule.join(__CONFIG.root, "server", "Routing");

        this.uris = {
            GET: {},
            POST: {},
            PUT: {},
            DELETE: {},
            HEAD: {},
            CONNECT: {},
            OPTIONS: {},
            TRACE: {},
            PATCH: {},
        };
    }

    declare() {}

    errorHandler(req, res) {
        res.showError();
    }

    async execute(req, res) {
        req.params = {};

        const workingMethodStack = this.uris[req.method];

        if (workingMethodStack) {
            const branches = Helper.parseUrlPathOfSlashesWithParams(req.url);

            let steps = [];
            let lastIdx = branches.length - 1;
            let notFound = false;
            let callbacks = null;
            let isFinish = null;
            let param = {};

            if (!branches.length) {
                notFound = true;
                isFinish = true;
            }

            for (let i = 0; i < branches.length; i++) {
                isFinish = lastIdx === i;
                const branch = branches[i];
                steps.push(branch);

                let localStepObj = workingMethodStack[steps[0]];

                for (let j = 1; j < steps.length; j++) {
                    let next = localStepObj[steps[j]];

                    if (!next) {
                        let validKey = "";

                        for (const k in localStepObj) {
                            let __param__ = Helper.isParamKey(k);
                            if (__param__) {
                                validKey = k;
                                param = {...param, [__param__[this.PARAM_PROP]]: steps[j].split("/").join("")};
                            }
                        }

                        if (validKey.length) {
                            localStepObj = localStepObj[validKey];
                        } else {
                            notFound = true;
                            break;
                        }

                        continue;
                    }

                    localStepObj = next
                }

                if (notFound) {
                    notFound = true;
                    break;
                }

                if (isFinish) {
                    callbacks = localStepObj;
                }
            }

            if (!callbacks || !callbacks.hasOwnProperty(this.CALLBACK_PROP) || !callbacks[this.CALLBACK_PROP]?.length) {
                notFound = true;
            }

            if (isFinish && notFound) {
                res.statusCode = 404;
                this.errorHandler(req, res);
                return;
            }

            if (param) {
                req.params = {...req.params, ...param};
            }

            for (const callback of callbacks[this.CALLBACK_PROP]) {
                const cb = Helper.isES6Class(callback) ?
                    new callback(req, res).result :
                    Helper.isFunction(callback) ? callback.bind(this, req, res) : undefined;

                if (!cb) {
                    throw new TypeError("Callback is not a Function or Class");
                }

                await Helper.executeAsyncOrNotFunction(cb);
            }
        } else {
            console.warn("[RouterFactory]: nothing routes exists in " + req.method + " method");
            res.statusCode = 503;
            this.errorHandler(req, res);
        }
    }

    register(method, url, ...callbacks) {
        if (Helper.checkMethodExists(method)) {
            if (!url) {
                throw new Error("[RouterFactory]: url must be declare!");
            }

            if (!callbacks || !callbacks.length) {
                throw new Error("[RouterFactory]: callback 's for" + url + " must be declared");
            }

            const branches = Helper.parseUrlPathOfSlashesWithParams(url);

            let branchLines = {};

            const branchBuilding = (link, array) => {
                if (!array.length) {
                    return link;
                }
                const dumpArr = array;
                const key = dumpArr[0];
                dumpArr.shift();
                link[key] = {};
                branchBuilding(link[key], dumpArr);
            }

            branchBuilding(branchLines, Array.from(branches));

            const makeParams = (__param) => {
                return __param ? {[this.PARAM_PROP]: __param} : {}
            }

            const iterateUrlsProps = (obj) => {
                for (const property in obj) {
                    if (obj.hasOwnProperty(property)) {
                        if (typeof obj[property] == "object") {
                            iterateUrlsProps(obj[property]);

                            if (property === branches[branches.length - 1]) {
                                obj[property] = {[this.CALLBACK_PROP]: callbacks, ...makeParams(Helper.isParamKey(property)[this.PARAM_PROP])};
                            }
                        }
                    }
                }
                return obj;
            }

            Helper.mergeDeep(this.uris[method], iterateUrlsProps(branchLines));
        } else {
            throw new Error("[RouterFactory]: METHOD  IS NOT ALLOWED");
        }
    }

    async include(req, res) {
        try {
            this.declare(req, res);
            await this.execute(req, res);
        } catch (e) {
            res.statusCode = 503;
            this.errorHandler(req, res);
        }
    }
}

module.exports = RouterFactory;
