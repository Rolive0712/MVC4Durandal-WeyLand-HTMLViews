(function () {/**
 * almond 0.2.0 Copyright (c) 2011, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        aps = [].slice;

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);

                name = baseParts.concat(name.split("/"));

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (waiting.hasOwnProperty(name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!defined.hasOwnProperty(name) && !defining.hasOwnProperty(name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    function onResourceLoad(name, defined, deps){
        if(requirejs.onResourceLoad && name){
            requirejs.onResourceLoad({defined:defined}, {id:name}, deps);
        }
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (typeof callback === 'function') {

            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (defined.hasOwnProperty(depName) ||
                           waiting.hasOwnProperty(depName) ||
                           defining.hasOwnProperty(depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback.apply(defined[name], args);

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }

        onResourceLoad(name, defined, args);
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 15);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        config = cfg;
        return req;
    };

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        waiting[name] = [name, deps, callback];
    };

    define.amd = {
        jQuery: true
    };
}());

define("../Scripts/almond-custom", function(){});

define('durandal/system',["require","jquery"],function(e,t){function n(e){var t="[object "+e+"]";r["is"+e]=function(e){return c.call(e)==t}}var r,i=!1,o=Object.keys,a=Object.prototype.hasOwnProperty,c=Object.prototype.toString,u=!1,s=Array.isArray,l=Array.prototype.slice;if(Function.prototype.bind&&("object"==typeof console||"function"==typeof console)&&"object"==typeof console.log)try{["log","info","warn","error","assert","dir","clear","profile","profileEnd"].forEach(function(e){console[e]=this.call(console[e],console)},Function.prototype.bind)}catch(d){u=!0}e.on&&e.on("moduleLoaded",function(e,t){r.setModuleId(e,t)}),"undefined"!=typeof requirejs&&(requirejs.onResourceLoad=function(e,t){r.setModuleId(e.defined[t.id],t.id)});var f=function(){},v=function(){try{if("undefined"!=typeof console&&"function"==typeof console.log)if(window.opera)for(var e=0;e<arguments.length;)console.log("Item "+(e+1)+": "+arguments[e]),e++;else 1==l.call(arguments).length&&"string"==typeof l.call(arguments)[0]?console.log(l.call(arguments).toString()):console.log.apply(console,l.call(arguments));else Function.prototype.bind&&!u||"undefined"==typeof console||"object"!=typeof console.log||Function.prototype.call.call(console.log,console,l.call(arguments))}catch(t){}},g=function(e){if(e instanceof Error)throw e;throw new Error(e)};r={version:"2.0.0",noop:f,getModuleId:function(e){return e?"function"==typeof e?e.prototype.__moduleId__:"string"==typeof e?null:e.__moduleId__:null},setModuleId:function(e,t){return e?"function"==typeof e?(e.prototype.__moduleId__=t,void 0):("string"!=typeof e&&(e.__moduleId__=t),void 0):void 0},resolveObject:function(e){return r.isFunction(e)?new e:e},debug:function(e){return 1==arguments.length&&(i=e,i?(this.log=v,this.error=g,this.log("Debug:Enabled")):(this.log("Debug:Disabled"),this.log=f,this.error=f)),i},log:f,error:f,assert:function(e,t){e||r.error(new Error(t||"Assert:Failed"))},defer:function(e){return t.Deferred(e)},guid:function(){return"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(e){var t=0|16*Math.random(),n="x"==e?t:8|3&t;return n.toString(16)})},acquire:function(){var t,n=arguments[0],i=!1;return r.isArray(n)?(t=n,i=!0):t=l.call(arguments,0),this.defer(function(n){e(t,function(){var e=arguments;setTimeout(function(){e.length>1||i?n.resolve(l.call(e,0)):n.resolve(e[0])},1)},function(e){n.reject(e)})}).promise()},extend:function(e){for(var t=l.call(arguments,1),n=0;n<t.length;n++){var r=t[n];if(r)for(var i in r)e[i]=r[i]}return e},wait:function(e){return r.defer(function(t){setTimeout(t.resolve,e)}).promise()}},r.keys=o||function(e){if(e!==Object(e))throw new TypeError("Invalid object");var t=[];for(var n in e)a.call(e,n)&&(t[t.length]=n);return t},r.isElement=function(e){return!(!e||1!==e.nodeType)},r.isArray=s||function(e){return"[object Array]"==c.call(e)},r.isObject=function(e){return e===Object(e)},r.isBoolean=function(e){return"boolean"==typeof e},r.isPromise=function(e){return e&&r.isFunction(e.then)};for(var p=["Arguments","Function","String","Number","Date","RegExp"],h=0;h<p.length;h++)n(p[h]);return r});
define('durandal/viewEngine',["durandal/system","jquery"],function(e,t){var n;return n=t.parseHTML?function(e){return t.parseHTML(e)}:function(e){return t(e).get()},{viewExtension:".html",viewPlugin:"text",isViewUrl:function(e){return-1!==e.indexOf(this.viewExtension,e.length-this.viewExtension.length)},convertViewUrlToViewId:function(e){return e.substring(0,e.length-this.viewExtension.length)},convertViewIdToRequirePath:function(e){return this.viewPlugin+"!"+e+this.viewExtension},parseMarkup:n,processMarkup:function(e){var t=this.parseMarkup(e);return this.ensureSingleElement(t)},ensureSingleElement:function(e){if(1==e.length)return e[0];for(var n=[],i=0;i<e.length;i++){var r=e[i];if(8!=r.nodeType){if(3==r.nodeType){var o=/\S/.test(r.nodeValue);if(!o)continue}n.push(r)}}return n.length>1?t(n).wrapAll('<div class="durandal-wrapper"></div>').parent().get(0):n[0]},createView:function(t){var n=this,i=this.convertViewIdToRequirePath(t);return e.defer(function(r){e.acquire(i).then(function(e){var i=n.processMarkup(e);i.setAttribute("data-view",t),r.resolve(i)}).fail(function(e){n.createFallbackView(t,i,e).then(function(e){e.setAttribute("data-view",t),r.resolve(e)})})}).promise()},createFallbackView:function(t,n){var i=this,r='View Not Found. Searched for "'+t+'" via path "'+n+'".';return e.defer(function(e){e.resolve(i.processMarkup('<div class="durandal-view-404">'+r+"</div>"))}).promise()}}});
define('durandal/viewLocator',["durandal/system","durandal/viewEngine"],function(e,t){function n(e,t){for(var n=0;n<e.length;n++){var i=e[n],r=i.getAttribute("data-view");if(r==t)return i}}function i(e){return(e+"").replace(/([\\\.\+\*\?\[\^\]\$\(\)\{\}\=\!\<\>\|\:])/g,"\\$1")}return{useConvention:function(e,t,n){e=e||"viewmodels",t=t||"views",n=n||t;var r=new RegExp(i(e),"gi");this.convertModuleIdToViewId=function(e){return e.replace(r,t)},this.translateViewIdToArea=function(e,t){return t&&"partial"!=t?n+"/"+t+"/"+e:n+"/"+e}},locateViewForObject:function(t,n,i){var r;if(t.getView&&(r=t.getView()))return this.locateView(r,n,i);if(t.viewUrl)return this.locateView(t.viewUrl,n,i);var o=e.getModuleId(t);return o?this.locateView(this.convertModuleIdToViewId(o),n,i):this.locateView(this.determineFallbackViewId(t),n,i)},convertModuleIdToViewId:function(e){return e},determineFallbackViewId:function(e){var t=/function (.{1,})\(/,n=t.exec(e.constructor.toString()),i=n&&n.length>1?n[1]:"";return"views/"+i},translateViewIdToArea:function(e){return e},locateView:function(i,r,o){if("string"==typeof i){var a;if(a=t.isViewUrl(i)?t.convertViewUrlToViewId(i):i,r&&(a=this.translateViewIdToArea(a,r)),o){var u=n(o,a);if(u)return e.defer(function(e){e.resolve(u)}).promise()}return t.createView(a)}return e.defer(function(e){e.resolve(i)}).promise()}}});
define('durandal/binder',["durandal/system","knockout"],function(e,t){function n(t){return void 0===t?{applyBindings:!0}:e.isBoolean(t)?{applyBindings:t}:(void 0===t.applyBindings&&(t.applyBindings=!0),t)}function i(i,s,l,v){if(!s||!l)return r.throwOnErrors?e.error(a):e.log(a,s,v),void 0;if(!s.getAttribute)return r.throwOnErrors?e.error(o):e.log(o,s,v),void 0;var f=s.getAttribute("data-view");try{var d;return i&&i.binding&&(d=i.binding(s)),d=n(d),r.binding(v,s,d),d.applyBindings?(e.log("Binding",f,v),t.applyBindings(l,s)):i&&t.utils.domData.set(s,u,{$data:i}),r.bindingComplete(v,s,d),i&&i.bindingComplete&&i.bindingComplete(s),t.utils.domData.set(s,c,d),d}catch(g){g.message=g.message+";\nView: "+f+";\nModuleId: "+e.getModuleId(v),r.throwOnErrors?e.error(g):e.log(g.message)}}var r,a="Insufficient Information to Bind",o="Unexpected View Type",c="durandal-binding-instruction",u="__ko_bindingContext__";return r={binding:e.noop,bindingComplete:e.noop,throwOnErrors:!1,getBindingInstruction:function(e){return t.utils.domData.get(e,c)},bindContext:function(e,t,n){return n&&e&&(e=e.createChildContext(n)),i(n,t,e,n||(e?e.$data:null))},bind:function(e,t){return i(e,t,e,e)}}});
define('durandal/activator',["durandal/system","knockout"],function(e,t){function n(e){return void 0==e&&(e={}),e.closeOnDeactivate||(e.closeOnDeactivate=s.defaults.closeOnDeactivate),e.beforeActivate||(e.beforeActivate=s.defaults.beforeActivate),e.afterDeactivate||(e.afterDeactivate=s.defaults.afterDeactivate),e.affirmations||(e.affirmations=s.defaults.affirmations),e.interpretResponse||(e.interpretResponse=s.defaults.interpretResponse),e.areSameItem||(e.areSameItem=s.defaults.areSameItem),e}function r(t,n,r){return e.isArray(r)?t[n].apply(t,r):t[n](r)}function i(t,n,r,i,a){if(t&&t.deactivate){e.log("Deactivating",t);var o;try{o=t.deactivate(n)}catch(c){return e.error(c),i.resolve(!1),void 0}o&&o.then?o.then(function(){r.afterDeactivate(t,n,a),i.resolve(!0)},function(t){e.log(t),i.resolve(!1)}):(r.afterDeactivate(t,n,a),i.resolve(!0))}else t&&r.afterDeactivate(t,n,a),i.resolve(!0)}function a(t,n,i,a){if(t)if(t.activate){e.log("Activating",t);var o;try{o=r(t,"activate",a)}catch(c){return e.error(c),i(!1),void 0}o&&o.then?o.then(function(){n(t),i(!0)},function(t){e.log(t),i(!1)}):(n(t),i(!0))}else n(t),i(!0);else i(!0)}function o(t,n,r){return r.lifecycleData=null,e.defer(function(i){if(t&&t.canDeactivate){var a;try{a=t.canDeactivate(n)}catch(o){return e.error(o),i.resolve(!1),void 0}a.then?a.then(function(e){r.lifecycleData=e,i.resolve(r.interpretResponse(e))},function(t){e.error(t),i.resolve(!1)}):(r.lifecycleData=a,i.resolve(r.interpretResponse(a)))}else i.resolve(!0)}).promise()}function c(t,n,i,a){return i.lifecycleData=null,e.defer(function(o){if(t==n())return o.resolve(!0),void 0;if(t&&t.canActivate){var c;try{c=r(t,"canActivate",a)}catch(u){return e.error(u),o.resolve(!1),void 0}c.then?c.then(function(e){i.lifecycleData=e,o.resolve(i.interpretResponse(e))},function(t){e.error(t),o.resolve(!1)}):(i.lifecycleData=c,o.resolve(i.interpretResponse(c)))}else o.resolve(!0)}).promise()}function u(r,u){var s,v=t.observable(null);u=n(u);var l=t.computed({read:function(){return v()},write:function(e){l.viaSetter=!0,l.activateItem(e)}});return l.__activator__=!0,l.settings=u,u.activator=l,l.isActivating=t.observable(!1),l.canDeactivateItem=function(e,t){return o(e,t,u)},l.deactivateItem=function(t,n){return e.defer(function(e){l.canDeactivateItem(t,n).then(function(r){r?i(t,n,u,e,v):(l.notifySubscribers(),e.resolve(!1))})}).promise()},l.canActivateItem=function(e,t){return c(e,v,u,t)},l.activateItem=function(t,n){var r=l.viaSetter;return l.viaSetter=!1,e.defer(function(o){if(l.isActivating())return o.resolve(!1),void 0;l.isActivating(!0);var c=v();return u.areSameItem(c,t,s,n)?(l.isActivating(!1),o.resolve(!0),void 0):(l.canDeactivateItem(c,u.closeOnDeactivate).then(function(f){f?l.canActivateItem(t,n).then(function(f){f?e.defer(function(e){i(c,u.closeOnDeactivate,u,e)}).promise().then(function(){t=u.beforeActivate(t,n),a(t,v,function(e){s=n,l.isActivating(!1),o.resolve(e)},n)}):(r&&l.notifySubscribers(),l.isActivating(!1),o.resolve(!1))}):(r&&l.notifySubscribers(),l.isActivating(!1),o.resolve(!1))}),void 0)}).promise()},l.canActivate=function(){var e;return r?(e=r,r=!1):e=l(),l.canActivateItem(e)},l.activate=function(){var e;return r?(e=r,r=!1):e=l(),l.activateItem(e)},l.canDeactivate=function(e){return l.canDeactivateItem(l(),e)},l.deactivate=function(e){return l.deactivateItem(l(),e)},l.includeIn=function(e){e.canActivate=function(){return l.canActivate()},e.activate=function(){return l.activate()},e.canDeactivate=function(e){return l.canDeactivate(e)},e.deactivate=function(e){return l.deactivate(e)}},u.includeIn?l.includeIn(u.includeIn):r&&l.activate(),l.forItems=function(t){u.closeOnDeactivate=!1,u.determineNextItemToActivate=function(e,t){var n=t-1;return-1==n&&e.length>1?e[1]:n>-1&&n<e.length-1?e[n]:null},u.beforeActivate=function(e){var n=l();if(e){var r=t.indexOf(e);-1==r?t.push(e):e=t()[r]}else e=u.determineNextItemToActivate(t,n?t.indexOf(n):0);return e},u.afterDeactivate=function(e,n){n&&t.remove(e)};var n=l.canDeactivate;l.canDeactivate=function(r){return r?e.defer(function(e){function n(){for(var t=0;t<a.length;t++)if(!a[t])return e.resolve(!1),void 0;e.resolve(!0)}for(var i=t(),a=[],o=0;o<i.length;o++)l.canDeactivateItem(i[o],r).then(function(e){a.push(e),a.length==i.length&&n()})}).promise():n()};var r=l.deactivate;return l.deactivate=function(n){return n?e.defer(function(e){function r(r){l.deactivateItem(r,n).then(function(){a++,t.remove(r),a==o&&e.resolve()})}for(var i=t(),a=0,o=i.length,c=0;o>c;c++)r(i[c])}).promise():r()},l},l}var s,v={closeOnDeactivate:!0,affirmations:["yes","ok","true"],interpretResponse:function(n){return e.isObject(n)&&(n=n.can||!1),e.isString(n)?-1!==t.utils.arrayIndexOf(this.affirmations,n.toLowerCase()):n},areSameItem:function(e,t){return e==t},beforeActivate:function(e){return e},afterDeactivate:function(e,t,n){t&&n&&n(null)}};return s={defaults:v,create:u,isActivator:function(e){return e&&e.__activator__}}});
define('durandal/composition',["durandal/system","durandal/viewLocator","durandal/binder","durandal/viewEngine","durandal/activator","jquery","knockout"],function(e,t,i,n,r,a,o){function c(e){for(var t=[],i={childElements:t,activeView:null},n=o.virtualElements.firstChild(e);n;)1==n.nodeType&&(t.push(n),n.getAttribute(h)&&(i.activeView=n)),n=o.virtualElements.nextSibling(n);return i.activeView||(i.activeView=t[0]),i}function l(){b--,0===b&&setTimeout(function(){for(var e=w.length;e--;)w[e]();w=[]},1)}function s(t,i,n){if(n)i();else if(t.activate&&t.model&&t.model.activate){var r;r=e.isArray(t.activationData)?t.model.activate.apply(t.model,t.activationData):t.model.activate(t.activationData),r&&r.then?r.then(i):r||void 0===r?i():l()}else i()}function u(){var t=this;t.activeView&&t.activeView.removeAttribute(h),t.child&&(t.model&&t.model.attached&&(t.composingNewView||t.alwaysTriggerAttach)&&t.model.attached(t.child,t.parent,t),t.attached&&t.attached(t.child,t.parent,t),t.child.setAttribute(h,!0),t.composingNewView&&t.model&&(t.model.compositionComplete&&m.current.complete(function(){t.model.compositionComplete(t.child,t.parent,t)}),t.model.detached&&o.utils.domNodeDisposal.addDisposeCallback(t.child,function(){t.model.detached(t.child,t.parent,t)})),t.compositionComplete&&m.current.complete(function(){t.compositionComplete(t.child,t.parent,t)})),l(),t.triggerAttach=e.noop}function d(t){if(e.isString(t.transition)){if(t.activeView){if(t.activeView==t.child)return!1;if(!t.child)return!0;if(t.skipTransitionOnSameViewId){var i=t.activeView.getAttribute("data-view"),n=t.child.getAttribute("data-view");return i!=n}}return!0}return!1}function v(e){for(var t=0,i=e.length,n=[];i>t;t++){var r=e[t].cloneNode(!0);n.push(r)}return n}function f(e){var t=v(e.parts),i=m.getParts(t),n=m.getParts(e.child);for(var r in i)a(n[r]).replaceWith(i[r])}function g(t){var i,n,r=o.virtualElements.childNodes(t);if(!e.isArray(r)){var a=[];for(i=0,n=r.length;n>i;i++)a[i]=r[i];r=a}for(i=1,n=r.length;n>i;i++)o.removeNode(r[i])}var m,p={},h="data-active-view",w=[],b=0,y="durandal-composition-data",A="data-part",D="["+A+"]",I=["model","view","transition","area","strategy","activationData"],V={complete:function(e){w.push(e)}};return m={convertTransitionToModuleId:function(e){return"transitions/"+e},defaultTransitionName:null,current:V,addBindingHandler:function(e,t,i){var n,r,a="composition-handler-"+e;t=t||o.bindingHandlers[e],i=i||function(){return void 0},r=o.bindingHandlers[e]={init:function(e,n,r,c,l){var s={trigger:o.observable(null)};return m.current.complete(function(){t.init&&t.init(e,n,r,c,l),t.update&&(o.utils.domData.set(e,a,t),s.trigger("trigger"))}),o.utils.domData.set(e,a,s),i(e,n,r,c,l)},update:function(e,t,i,n,r){var c=o.utils.domData.get(e,a);return c.update?c.update(e,t,i,n,r):(c.trigger(),void 0)}};for(n in t)"init"!==n&&"update"!==n&&(r[n]=t[n])},getParts:function(t){var i={};e.isArray(t)||(t=[t]);for(var n=0;n<t.length;n++){var r=t[n];if(r.getAttribute){var o=r.getAttribute(A);o&&(i[o]=r);for(var c=a(D,r).not(a("[data-bind] "+D,r)),l=0;l<c.length;l++){var s=c.get(l);i[s.getAttribute(A)]=s}}}return i},cloneNodes:v,finalize:function(t){if(t.transition=t.transition||this.defaultTransitionName,t.child||t.activeView)if(d(t)){var n=this.convertTransitionToModuleId(t.transition);e.acquire(n).then(function(e){t.transition=e,e(t).then(function(){if(t.cacheViews){if(t.activeView){var e=i.getBindingInstruction(t.activeView);void 0==e.cacheViews||e.cacheViews||o.removeNode(t.activeView)}}else t.child?g(t.parent):o.virtualElements.emptyNode(t.parent);t.triggerAttach()})}).fail(function(t){e.error("Failed to load transition ("+n+"). Details: "+t.message)})}else{if(t.child!=t.activeView){if(t.cacheViews&&t.activeView){var r=i.getBindingInstruction(t.activeView);void 0==r.cacheViews||r.cacheViews?a(t.activeView).hide():o.removeNode(t.activeView)}t.child?(t.cacheViews||g(t.parent),a(t.child).show()):t.cacheViews||o.virtualElements.emptyNode(t.parent)}t.triggerAttach()}else t.cacheViews||o.virtualElements.emptyNode(t.parent),t.triggerAttach()},bindAndShow:function(e,t,r){t.child=e,t.composingNewView=t.cacheViews?-1==o.utils.arrayIndexOf(t.viewElements,e):!0,s(t,function(){if(t.binding&&t.binding(t.child,t.parent,t),t.preserveContext&&t.bindingContext)t.composingNewView&&(t.parts&&f(t),a(e).hide(),o.virtualElements.prepend(t.parent,e),i.bindContext(t.bindingContext,e,t.model));else if(e){var r=t.model||p,c=o.dataFor(e);if(c!=r){if(!t.composingNewView)return a(e).remove(),n.createView(e.getAttribute("data-view")).then(function(e){m.bindAndShow(e,t,!0)}),void 0;t.parts&&f(t),a(e).hide(),o.virtualElements.prepend(t.parent,e),i.bind(r,e)}}m.finalize(t)},r)},defaultStrategy:function(e){return t.locateViewForObject(e.model,e.area,e.viewElements)},getSettings:function(t){var i,a=t(),c=o.utils.unwrapObservable(a)||{},l=r.isActivator(a);if(e.isString(c))return c=n.isViewUrl(c)?{view:c}:{model:c,activate:!0};if(i=e.getModuleId(c))return c={model:c,activate:!0};!l&&c.model&&(l=r.isActivator(c.model));for(var s in c)c[s]=-1!=o.utils.arrayIndexOf(I,s)?o.utils.unwrapObservable(c[s]):c[s];return l?c.activate=!1:void 0===c.activate&&(c.activate=!0),c},executeStrategy:function(e){e.strategy(e).then(function(t){m.bindAndShow(t,e)})},inject:function(i){return i.model?i.view?(t.locateView(i.view,i.area,i.viewElements).then(function(e){m.bindAndShow(e,i)}),void 0):(i.strategy||(i.strategy=this.defaultStrategy),e.isString(i.strategy)?e.acquire(i.strategy).then(function(e){i.strategy=e,m.executeStrategy(i)}).fail(function(t){e.error("Failed to load view strategy ("+i.strategy+"). Details: "+t.message)}):this.executeStrategy(i),void 0):(this.bindAndShow(null,i),void 0)},compose:function(i,n,r,a){b++,a||(n=m.getSettings(function(){return n},i));var o=c(i);n.activeView=o.activeView,n.parent=i,n.triggerAttach=u,n.bindingContext=r,n.cacheViews&&!n.viewElements&&(n.viewElements=o.childElements),n.model?e.isString(n.model)?e.acquire(n.model).then(function(t){n.model=e.resolveObject(t),m.inject(n)}).fail(function(t){e.error("Failed to load composed module ("+n.model+"). Details: "+t.message)}):m.inject(n):n.view?(n.area=n.area||"partial",n.preserveContext=!0,t.locateView(n.view,n.area,n.viewElements).then(function(e){m.bindAndShow(e,n)})):this.bindAndShow(null,n)}},o.bindingHandlers.compose={init:function(){return{controlsDescendantBindings:!0}},update:function(e,t,i,r,a){var c=m.getSettings(t,e);if(c.mode){var l=o.utils.domData.get(e,y);if(!l){var s=o.virtualElements.childNodes(e);l={},"inline"===c.mode?l.view=n.ensureSingleElement(s):"templated"===c.mode&&(l.parts=v(s)),o.virtualElements.emptyNode(e),o.utils.domData.set(e,y,l)}"inline"===c.mode?c.view=l.view.cloneNode(!0):"templated"===c.mode&&(c.parts=l.parts),c.preserveContext=!0}m.compose(e,c,a,!0)}},o.virtualElements.allowedBindings.compose=!0,m});
define('durandal/events',["durandal/system"],function(e){var t=/\s+/,i=function(){},n=function(e,t){this.owner=e,this.events=t};return n.prototype.then=function(e,t){return this.callback=e||this.callback,this.context=t||this.context,this.callback?(this.owner.on(this.events,this.callback,this.context),this):this},n.prototype.on=n.prototype.then,n.prototype.off=function(){return this.owner.off(this.events,this.callback,this.context),this},i.prototype.on=function(e,i,r){var a,o,c;if(i){for(a=this.callbacks||(this.callbacks={}),e=e.split(t);o=e.shift();)c=a[o]||(a[o]=[]),c.push(i,r);return this}return new n(this,e)},i.prototype.off=function(i,n,r){var a,o,c,s;if(!(o=this.callbacks))return this;if(!(i||n||r))return delete this.callbacks,this;for(i=i?i.split(t):e.keys(o);a=i.shift();)if((c=o[a])&&(n||r))for(s=c.length-2;s>=0;s-=2)n&&c[s]!==n||r&&c[s+1]!==r||c.splice(s,2);else delete o[a];return this},i.prototype.trigger=function(e){var i,n,r,a,o,c,s,l;if(!(n=this.callbacks))return this;for(l=[],e=e.split(t),a=1,o=arguments.length;o>a;a++)l[a-1]=arguments[a];for(;i=e.shift();){if((s=n.all)&&(s=s.slice()),(r=n[i])&&(r=r.slice()),r)for(a=0,o=r.length;o>a;a+=2)r[a].apply(r[a+1]||this,l);if(s)for(c=[i].concat(l),a=0,o=s.length;o>a;a+=2)s[a].apply(s[a+1]||this,c)}return this},i.prototype.proxy=function(e){var t=this;return function(i){t.trigger(e,i)}},i.includeIn=function(e){e.on=i.prototype.on,e.off=i.prototype.off,e.trigger=i.prototype.trigger,e.proxy=i.prototype.proxy},i});
define('durandal/app',["durandal/system","durandal/viewEngine","durandal/composition","durandal/events","jquery"],function(e,t,n,i,r){function a(){return e.defer(function(t){return 0==c.length?(t.resolve(),void 0):(e.acquire(c).then(function(n){for(var i=0;i<n.length;i++){var r=n[i];if(r.install){var a=u[i];e.isObject(a)||(a={}),r.install(a),e.log("Plugin:Installed "+c[i])}else e.log("Plugin:Loaded "+c[i])}t.resolve()}).fail(function(t){e.error("Failed to load plugin(s). Details: "+t.message)}),void 0)}).promise()}var o,c=[],u=[];return o={title:"Application",configurePlugins:function(t,n){var i=e.keys(t);n=n||"plugins/",-1===n.indexOf("/",n.length-1)&&(n+="/");for(var r=0;r<i.length;r++){var a=i[r];c.push(n+a),u.push(t[a])}},start:function(){return e.log("Application:Starting"),this.title&&(document.title=this.title),e.defer(function(t){r(function(){a().then(function(){t.resolve(),e.log("Application:Started")})})}).promise()},setRoot:function(i,r,a){var o,c={activate:!0,transition:r};o=!a||e.isString(a)?document.getElementById(a||"applicationHost"):a,e.isString(i)?t.isViewUrl(i)?c.view=i:c.model=i:c.model=i,n.compose(o,c)}},i.includeIn(o),o});
define('plugins/history',["durandal/system","jquery"],function(e,t){function n(e,t,n){if(n){var i=e.href.replace(/(javascript:|#).*$/,"");e.replace(i+"#"+t)}else e.hash="#"+t}var i=/^[#\/]|\s+$/g,a=/^\/+|\/+$/g,o=/msie [\w.]+/,r=/\/$/,s={interval:50,active:!1};return"undefined"!=typeof window&&(s.location=window.location,s.history=window.history),s.getHash=function(e){var t=(e||s).location.href.match(/#(.*)$/);return t?t[1]:""},s.getFragment=function(e,t){if(null==e)if(s._hasPushState||!s._wantsHashChange||t){e=s.location.pathname;var n=s.root.replace(r,"");e.indexOf(n)||(e=e.substr(n.length))}else e=s.getHash();return e.replace(i,"")},s.activate=function(n){s.active&&e.error("History has already been activated."),s.active=!0,s.options=e.extend({},{root:"/"},s.options,n),s.root=s.options.root,s._wantsHashChange=s.options.hashChange!==!1,s._wantsPushState=!!s.options.pushState,s._hasPushState=!!(s.options.pushState&&s.history&&s.history.pushState);var r=s.getFragment(),c=document.documentMode,l=o.exec(navigator.userAgent.toLowerCase())&&(!c||7>=c);s.root=("/"+s.root+"/").replace(a,"/"),l&&s._wantsHashChange&&(s.iframe=t('<iframe src="javascript:0" tabindex="-1" />').hide().appendTo("body")[0].contentWindow,s.navigate(r,!1)),s._hasPushState?t(window).on("popstate",s.checkUrl):s._wantsHashChange&&"onhashchange"in window&&!l?t(window).on("hashchange",s.checkUrl):s._wantsHashChange&&(s._checkUrlInterval=setInterval(s.checkUrl,s.interval)),s.fragment=r;var u=s.location,d=u.pathname.replace(/[^\/]$/,"$&/")===s.root;if(s._wantsHashChange&&s._wantsPushState){if(!s._hasPushState&&!d)return s.fragment=s.getFragment(null,!0),s.location.replace(s.root+s.location.search+"#"+s.fragment),!0;s._hasPushState&&d&&u.hash&&(this.fragment=s.getHash().replace(i,""),this.history.replaceState({},document.title,s.root+s.fragment+u.search))}return s.options.silent?void 0:s.loadUrl()},s.deactivate=function(){t(window).off("popstate",s.checkUrl).off("hashchange",s.checkUrl),clearInterval(s._checkUrlInterval),s.active=!1},s.checkUrl=function(){var e=s.getFragment();return e===s.fragment&&s.iframe&&(e=s.getFragment(s.getHash(s.iframe))),e===s.fragment?!1:(s.iframe&&s.navigate(e,!1),s.loadUrl(),void 0)},s.loadUrl=function(e){var t=s.fragment=s.getFragment(e);return s.options.routeHandler?s.options.routeHandler(t):!1},s.navigate=function(t,i){if(!s.active)return!1;if(void 0===i?i={trigger:!0}:e.isBoolean(i)&&(i={trigger:i}),t=s.getFragment(t||""),s.fragment!==t){s.fragment=t;var a=s.root+t;if(s._hasPushState)s.history[i.replace?"replaceState":"pushState"]({},document.title,a);else{if(!s._wantsHashChange)return s.location.assign(a);n(s.location,t,i.replace),s.iframe&&t!==s.getFragment(s.getHash(s.iframe))&&(i.replace||s.iframe.document.open().close(),n(s.iframe.location,t,i.replace))}return i.trigger?s.loadUrl(t):void 0}},s.navigateBack=function(){s.history.back()},s});
define('plugins/router',["durandal/system","durandal/app","durandal/activator","durandal/events","durandal/composition","plugins/history","knockout","jquery"],function(e,t,n,i,r,a,o,c){function u(e){return e=e.replace(b,"\\$&").replace(p,"(?:$1)?").replace(h,function(e,t){return t?e:"([^/]+)"}).replace(m,"(.*?)"),new RegExp("^"+e+"$")}function s(e){var t=e.indexOf(":"),n=t>0?t-1:e.length;return e.substring(0,n)}function l(e){return e.router&&e.router.loadUrl}function d(e,t){return-1!==e.indexOf(t,e.length-t.length)}function f(e,t){if(!e||!t)return!1;if(e.length!=t.length)return!1;for(var n=0,i=e.length;i>n;n++)if(e[n]!=t[n])return!1;return!0}var v,g,p=/\((.*?)\)/g,h=/(\(\?)?:\w+/g,m=/\*\w+/g,b=/[\-{}\[\]+?.,\\\^$|#\s]/g,y=/\/$/,w=function(){function r(t,n){e.log("Navigation Complete",t,n);var i=e.getModuleId(C);i&&P.trigger("router:navigation:from:"+i),C=t,O=n;var r=e.getModuleId(C);r&&P.trigger("router:navigation:to:"+r),l(t)||P.updateDocumentTitle(t,n),g.explicitNavigation=!1,g.navigatingBack=!1,P.trigger("router:navigation:complete",t,n,P)}function c(t,n){e.log("Navigation Cancelled"),P.activeInstruction(O),O&&P.navigate(O.fragment,!1),N(!1),g.explicitNavigation=!1,g.navigatingBack=!1,P.trigger("router:navigation:cancelled",t,n,P)}function p(t){e.log("Navigation Redirecting"),N(!1),g.explicitNavigation=!1,g.navigatingBack=!1,P.navigate(t,{trigger:!0,replace:!0})}function h(e,t,n){g.navigatingBack=!g.explicitNavigation&&C!=n.fragment,P.trigger("router:route:activating",t,n,P),e.activateItem(t,n.params).then(function(i){if(i){var a=C;r(t,n),l(t)&&x({router:t.router,fragment:n.fragment,queryString:n.queryString}),a==t&&P.attached()}else e.settings.lifecycleData&&e.settings.lifecycleData.redirect?p(e.settings.lifecycleData.redirect):c(t,n);v&&(v.resolve(),v=null)})}function m(t,n,i){var r=P.guardRoute(n,i);r?r.then?r.then(function(r){r?e.isString(r)?p(r):h(t,n,i):c(n,i)}):e.isString(r)?p(r):h(t,n,i):c(n,i)}function b(e,t,n){P.guardRoute?m(e,t,n):h(e,t,n)}function _(e){return O&&O.config.moduleId==e.config.moduleId&&C&&(C.canReuseForRoute&&C.canReuseForRoute.apply(C,e.params)||C.router&&C.router.loadUrl)}function I(){if(!N()){var t=V.shift();if(V=[],t){if(t.router){var i=t.fragment;return t.queryString&&(i+="?"+t.queryString),t.router.loadUrl(i),void 0}N(!0),P.activeInstruction(t),_(t)?b(n.create(),C,t):e.acquire(t.config.moduleId).then(function(n){var i=e.resolveObject(n);b(T,i,t)}).fail(function(n){e.error("Failed to load routed module ("+t.config.moduleId+"). Details: "+n.message)})}}}function x(e){V.unshift(e),I()}function S(e,t,n){for(var i=e.exec(t).slice(1),r=0;r<i.length;r++){var a=i[r];i[r]=a?decodeURIComponent(a):null}var o=P.parseQueryString(n);return o&&i.push(o),{params:i,queryParams:o}}function A(t){P.trigger("router:route:before-config",t,P),e.isRegExp(t)?t.routePattern=t.route:(t.title=t.title||P.convertRouteToTitle(t.route),t.moduleId=t.moduleId||P.convertRouteToModuleId(t.route),t.hash=t.hash||P.convertRouteToHash(t.route),t.routePattern=u(t.route)),P.trigger("router:route:after-config",t,P),P.routes.push(t),P.route(t.routePattern,function(e,n){var i=S(t.routePattern,e,n);x({fragment:e,queryString:n,config:t,params:i.params,queryParams:i.queryParams})})}function k(t){if(e.isArray(t.route))for(var n=0,i=t.route.length;i>n;n++){var r=e.extend({},t);r.route=t.route[n],n>0&&delete r.nav,A(r)}else A(t);return P}function D(e){e.isActive||(e.isActive=o.computed(function(){var t=T();return t&&t.__moduleId__==e.moduleId}))}var C,O,V=[],N=o.observable(!1),T=n.create(),P={handlers:[],routes:[],navigationModel:o.observableArray([]),activeItem:T,isNavigating:o.computed(function(){var e=T(),t=N(),n=e&&e.router&&e.router!=P&&e.router.isNavigating()?!0:!1;return t||n}),activeInstruction:o.observable(null),__router__:!0};return i.includeIn(P),T.settings.areSameItem=function(e,t,n,i){return e==t?f(n,i):!1},P.parseQueryString=function(e){var t,n;if(!e)return null;if(n=e.split("&"),0==n.length)return null;t={};for(var i=0;i<n.length;i++){var r=n[i];if(""!==r){var a=r.split("=");t[a[0]]=a[1]&&decodeURIComponent(a[1].replace(/\+/g," "))}}return t},P.route=function(e,t){P.handlers.push({routePattern:e,callback:t})},P.loadUrl=function(t){var n=P.handlers,i=null,r=t,o=t.indexOf("?");if(-1!=o&&(r=t.substring(0,o),i=t.substr(o+1)),P.relativeToParentRouter){var c=this.parent.activeInstruction();r=c.params.join("/"),r&&"/"==r[0]&&(r=r.substr(1)),r||(r=""),r=r.replace("//","/").replace("//","/")}r=r.replace(y,"");for(var u=0;u<n.length;u++){var s=n[u];if(s.routePattern.test(r))return s.callback(r,i),!0}return e.log("Route Not Found"),P.trigger("router:route:not-found",t,P),O&&a.navigate(O.fragment,{trigger:!1,replace:!0}),g.explicitNavigation=!1,g.navigatingBack=!1,!1},P.updateDocumentTitle=function(e,n){n.config.title?document.title=t.title?n.config.title+" | "+t.title:n.config.title:t.title&&(document.title=t.title)},P.navigate=function(e,t){return e&&-1!=e.indexOf("://")?(window.location.href=e,!0):(g.explicitNavigation=!0,a.navigate(e,t))},P.navigateBack=function(){a.navigateBack()},P.attached=function(){setTimeout(function(){N(!1),P.trigger("router:navigation:attached",C,O,P),I()},10)},P.compositionComplete=function(){P.trigger("router:navigation:composition-complete",C,O,P)},P.convertRouteToHash=function(e){if(P.relativeToParentRouter){var t=P.parent.activeInstruction(),n=t.config.hash+"/"+e;return a._hasPushState&&(n="/"+n),n=n.replace("//","/").replace("//","/")}return a._hasPushState?e:"#"+e},P.convertRouteToModuleId=function(e){return s(e)},P.convertRouteToTitle=function(e){var t=s(e);return t.substring(0,1).toUpperCase()+t.substring(1)},P.map=function(t,n){if(e.isArray(t)){for(var i=0;i<t.length;i++)P.map(t[i]);return P}return e.isString(t)||e.isRegExp(t)?(n?e.isString(n)&&(n={moduleId:n}):n={},n.route=t):n=t,k(n)},P.buildNavigationModel=function(t){var n=[],i=P.routes;t=t||100;for(var r=0;r<i.length;r++){var a=i[r];a.nav&&(e.isNumber(a.nav)||(a.nav=t),D(a),n.push(a))}return n.sort(function(e,t){return e.nav-t.nav}),P.navigationModel(n),P},P.mapUnknownRoutes=function(t,n){var i="*catchall",r=u(i);return P.route(r,function(o,c){var u=S(r,o,c),s={fragment:o,queryString:c,config:{route:i,routePattern:r},params:u.params,queryParams:u.queryParams};if(t)if(e.isString(t))s.config.moduleId=t,n&&a.navigate(n,{trigger:!1,replace:!0});else if(e.isFunction(t)){var l=t(s);if(l&&l.then)return l.then(function(){P.trigger("router:route:before-config",s.config,P),P.trigger("router:route:after-config",s.config,P),x(s)}),void 0}else s.config=t,s.config.route=i,s.config.routePattern=r;else s.config.moduleId=o;P.trigger("router:route:before-config",s.config,P),P.trigger("router:route:after-config",s.config,P),x(s)}),P},P.reset=function(){return O=C=void 0,P.handlers=[],P.routes=[],P.off(),delete P.options,P},P.makeRelative=function(t){return e.isString(t)&&(t={moduleId:t,route:t}),t.moduleId&&!d(t.moduleId,"/")&&(t.moduleId+="/"),t.route&&!d(t.route,"/")&&(t.route+="/"),t.fromParent&&(P.relativeToParentRouter=!0),P.on("router:route:before-config").then(function(e){t.moduleId&&(e.moduleId=t.moduleId+e.moduleId),t.route&&(e.route=""===e.route?t.route.substring(0,t.route.length-1):t.route+e.route)}),P},P.createChildRouter=function(){var e=w();return e.parent=P,e},P};return g=w(),g.explicitNavigation=!1,g.navigatingBack=!1,g.activate=function(t){return e.defer(function(n){if(v=n,g.options=e.extend({routeHandler:g.loadUrl},g.options,t),a.activate(g.options),a._hasPushState)for(var i=g.routes,r=i.length;r--;){var o=i[r];o.hash=o.hash.replace("#","")}c(document).delegate("a","click",function(e){if(g.explicitNavigation=!0,a._hasPushState&&!(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)){var t=c(this).attr("href"),n=this.protocol+"//";(!t||"#"!==t.charAt(0)&&t.slice(n.length)!==n)&&(e.preventDefault(),a.navigate(t))}})}).promise()},g.deactivate=function(){a.deactivate()},g.install=function(){o.bindingHandlers.router={init:function(){return{controlsDescendantBindings:!0}},update:function(e,t,n,i,a){var c=o.utils.unwrapObservable(t())||{};if(c.__router__)c={model:c.activeItem(),attached:c.attached,compositionComplete:c.compositionComplete,activate:!1};else{var u=o.utils.unwrapObservable(c.router||i.router)||g;c.model=u.activeItem(),c.attached=u.attached,c.compositionComplete=u.compositionComplete,c.activate=!1}r.compose(e,c,a)}},o.virtualElements.allowedBindings.router=!0},g});
define('services/logger',["durandal/system"],function(t){function n(t,n,r,e){o(t,n,r,e,"info")}function r(t,n,r,e){o(t,n,r,e,"error")}function o(n,r,o,e,i){o=o?"["+o+"] ":"",r?t.log(o,n,r):t.log(o,n),e&&("error"===i?toastr.error(n):toastr.info(n))}var e={log:n,logError:r};return e});
function boot(t,o,n){n.debug(!0),t.title="My App",t.configurePlugins({router:!0,dialog:!0,widget:!0,observable:!0}),t.start().then(function(){toastr.options.positionClass="toast-bottom-right",toastr.options.backgroundpositionClass="toast-bottom-right",o.useConvention(),t.setRoot("viewmodels/shell","entrance")})}require.config({paths:{text:"../Scripts/text",durandal:"../Scripts/durandal",plugins:"../Scripts/durandal/plugins",transitions:"../Scripts/durandal/transitions"}}),define("jquery",[],function(){return jQuery}),define("knockout",ko),define('main',["durandal/app","durandal/viewLocator","durandal/system","plugins/router","services/logger"],boot);
define('services/datacontext',[],function(){function t(){var t={viewname:"northwind",orderid:1};return $.ajax({url:"/Northwind/GetOrders",type:"POST",cache:!1,data:JSON.stringify(t),async:!0,dataType:"json",contentType:"application/json; charset=utf-8"})}var n={getOrders:t};return n});
define('viewmodels/details',["services/logger"],function(t){function n(){return t.log(r+" View Activated",null,r,!0),!0}var r="Details",o={activate:n,title:r};return o});
define('viewmodels/home',["services/logger"],function(t){function n(){return t.log(r+" View Activated",null,r,!0),!0}var r="Home",e={activate:n,title:r};return e});
define('viewmodels/northwind',["durandal/app","services/logger","services/datacontext"],function(t,e,n){var r={};return r.orders=ko.observableArray([]),r.isLoading=ko.observable(!1),r.isAttachedToView=ko.observable(!1),r.activate=function(){return r.isLoading(!0),$.when(n.getOrders()).done(r.successCallback).fail(r.failCallback),!0},r.successCallback=function(t){r.orders=t,r.isLoading(!1),r.isAttachedToView(!0)},r.failCallback=function(t){console.log("Error: "+t.responseText)},r.canDeactivate=function(){return!0},r});
define('viewmodels/shell',["durandal/system","plugins/router","services/logger"],function(e,t,o){function n(){return r()}function r(){i("Hot Towel SPA Loaded!",null,!0),t.on("router:route:not-found",function(e){a("No Route Found",e,!0)});var e=[{route:"",moduleId:"home",title:"Home",nav:1},{route:"details",moduleId:"details",title:"Details",nav:2},{route:"northwind",moduleId:"northwind",title:"Northwind",nav:3}];return t.makeRelative({moduleId:"viewmodels"}).map(e).buildNavigationModel().activate()}function i(t,n,r){o.log(t,n,e.getModuleId(u),r)}function a(t,n,r){o.logError(t,n,e.getModuleId(u),r)}var u={activate:n,router:t};return u});
define('text',{load: function(id){throw new Error("Dynamic load not allowed: " + id);}});

define('text!views/details.html',[],function () { return '<section>\r\n    <h2 class="page-title" data-bind="text: title"></h2>\r\n</section>';});


define('text!views/footer.html',[],function () { return '<nav class="navbar navbar-fixed-bottom">\r\n    <div class="navbar-inner navbar-content-center">\r\n        <span class="pull-left"><a href="http://johnpapa.net/spa" target="_blank">Learn how to build a SPA </a></span>\r\n        <span class="pull-right"><a href="http://johnpapa.net/hottowel" target="_blank">Hot Towel SPA - © 2013 JohnPapa.net</a></span>\r\n    </div>\r\n</nav>\r\n';});


define('text!views/home.html',[],function () { return '<section>\r\n    <h2 class="page-title" data-bind="text: title"></h2>\r\n</section>';});


define('text!views/nav.html',[],function () { return '<nav class="navbar navbar-fixed-top">\r\n    <div class="navbar-inner">\r\n        <a class="brand" href="/">\r\n            <span class="title">Hot Towel SPA</span> \r\n        </a>\r\n        <div class="btn-group" data-bind="foreach: router.navigationModel">\r\n            <a data-bind="css: { active: isActive }, attr: { href: hash }, text: title" \r\n                class="btn btn-info" href="#"></a>\r\n        </div>\r\n        <div class="loader pull-right" data-bind="css: { active: router.isNavigating }">\r\n            <div class="progress progress-striped active page-progress-bar">\r\n                <div class="bar" style="width: 100px;"></div>\r\n            </div>\r\n        </div>\r\n    </div>\r\n</nav>';});


define('text!views/northwind.html',[],function () { return '<h2>northwind Orders</h2>\r\n\r\n<section id="TableOrders">\r\n    <div class="table-responsive">\r\n        <table class="table table-condensed">\r\n            <thead>\r\n                <tr>\r\n                    <th>Order ID</th>\r\n                    <th>Customer ID</th>\r\n                    <th>Ship Name</th>\r\n                    <th>Ship City</th>\r\n                    <th>Ship Country</th>\r\n                </tr>\r\n            </thead>\r\n            <!-- ko if: isAttachedToView() -->\r\n            <tbody data-bind="foreach: orders">\r\n                <tr>\r\n                    <td data-bind="text: OrderID"></td>\r\n                    <td data-bind="text: CustomerID"></td>\r\n                    <td data-bind="text: ShipName"></td>\r\n                    <td data-bind="text: ShipCity"></td>\r\n                    <td data-bind="text: ShipCountry"></td>\r\n                </tr>\r\n            </tbody>\r\n            <!-- /ko -->\r\n        </table>\r\n    </div>\r\n</section>';});


define('text!views/shell.html',[],function () { return '<div>\r\n    <header data-bind="compose: { view: \'nav\' }"></header>\r\n    <section id="content" class="main container-fluid"\r\n        data-bind="router: { transition: \'entrance\', cacheViews: true }">\r\n    </section>\r\n    <footer data-bind="compose: { view: \'footer\' }"></footer>\r\n</div>\r\n';});

define('plugins/dialog',["durandal/system","durandal/app","durandal/composition","durandal/activator","durandal/viewEngine","jquery","knockout"],function(e,t,i,n,o,r,a){function s(t){return e.defer(function(i){e.isString(t)?e.acquire(t).then(function(t){i.resolve(e.resolveObject(t))}).fail(function(i){e.error("Failed to load dialog module ("+t+"). Details: "+i.message)}):i.resolve(t)}).promise()}var c,l={},u=0,d=function(e,t,i){this.message=e,this.title=t||d.defaultTitle,this.options=i||d.defaultOptions};return d.prototype.selectOption=function(e){c.close(this,e)},d.prototype.getView=function(){return o.processMarkup(d.defaultViewMarkup)},d.setViewUrl=function(e){delete d.prototype.getView,d.prototype.viewUrl=e},d.defaultTitle=t.title||"Application",d.defaultOptions=["Ok"],d.defaultViewMarkup=['<div data-view="plugins/messageBox" class="messageBox">','<div class="modal-header">','<h3 data-bind="text: title"></h3>',"</div>",'<div class="modal-body">','<p class="message" data-bind="text: message"></p>',"</div>",'<div class="modal-footer" data-bind="foreach: options">','<button class="btn" data-bind="click: function () { $parent.selectOption($data); }, text: $data, css: { \'btn-primary\': $index() == 0, autofocus: $index() == 0 }"></button>',"</div>","</div>"].join("\n"),c={MessageBox:d,currentZIndex:1050,getNextZIndex:function(){return++this.currentZIndex},isOpen:function(){return u>0},getContext:function(e){return l[e||"default"]},addContext:function(e,t){t.name=e,l[e]=t;var i="show"+e.substr(0,1).toUpperCase()+e.substr(1);this[i]=function(t,i){return this.show(t,i,e)}},createCompositionSettings:function(e,t){var i={model:e,activate:!1};return t.attached&&(i.attached=t.attached),t.compositionComplete&&(i.compositionComplete=t.compositionComplete),i},getDialog:function(e){return e?e.__dialog__:void 0},close:function(e){var t=this.getDialog(e);if(t){var i=Array.prototype.slice.call(arguments,1);t.close.apply(t,i)}},show:function(t,o,r){var a=this,c=l[r||"default"];return e.defer(function(e){s(t).then(function(t){var r=n.create();r.activateItem(t,o).then(function(n){if(n){var o=t.__dialog__={owner:t,context:c,activator:r,close:function(){var i=arguments;r.deactivateItem(t,!0).then(function(n){n&&(u--,c.removeHost(o),delete t.__dialog__,0==i.length?e.resolve():1==i.length?e.resolve(i[0]):e.resolve.apply(e,i))})}};o.settings=a.createCompositionSettings(t,c),c.addHost(o),u++,i.compose(o.host,o.settings)}else e.resolve(!1)})})}).promise()},showMessage:function(t,i,n){return e.isString(this.MessageBox)?c.show(this.MessageBox,[t,i||d.defaultTitle,n||d.defaultOptions]):c.show(new this.MessageBox(t,i,n))},install:function(e){t.showDialog=function(e,t,i){return c.show(e,t,i)},t.showMessage=function(e,t,i){return c.showMessage(e,t,i)},e.messageBox&&(c.MessageBox=e.messageBox),e.messageBoxView&&(c.MessageBox.prototype.getView=function(){return e.messageBoxView})}},c.addContext("default",{blockoutOpacity:.2,removeDelay:200,addHost:function(e){var t=r("body"),i=r('<div class="modalBlockout"></div>').css({"z-index":c.getNextZIndex(),opacity:this.blockoutOpacity}).appendTo(t),n=r('<div class="modalHost"></div>').css({"z-index":c.getNextZIndex()}).appendTo(t);if(e.host=n.get(0),e.blockout=i.get(0),!c.isOpen()){e.oldBodyMarginRight=t.css("margin-right"),e.oldInlineMarginRight=t.get(0).style.marginRight;var o=r("html"),a=t.outerWidth(!0),s=o.scrollTop();r("html").css("overflow-y","hidden");var l=r("body").outerWidth(!0);t.css("margin-right",l-a+parseInt(e.oldBodyMarginRight)+"px"),o.scrollTop(s)}},removeHost:function(e){if(r(e.host).css("opacity",0),r(e.blockout).css("opacity",0),setTimeout(function(){a.removeNode(e.host),a.removeNode(e.blockout)},this.removeDelay),!c.isOpen()){var t=r("html"),i=t.scrollTop();t.css("overflow-y","").scrollTop(i),e.oldInlineMarginRight?r("body").css("margin-right",e.oldBodyMarginRight):r("body").css("margin-right","")}},compositionComplete:function(e,t,i){var n=r(e),o=n.width(),a=n.height(),s=c.getDialog(i.model);n.css({"margin-top":(-a/2).toString()+"px","margin-left":(-o/2).toString()+"px"}),r(s.host).css("opacity",1),r(e).hasClass("autoclose")&&r(s.blockout).click(function(){s.close()}),r(".autofocus",e).each(function(){r(this).focus()})}}),c});
define('plugins/http',["jquery","knockout"],function(e,t){return{callbackParam:"callback",get:function(t,n){return e.ajax(t,{data:n})},jsonp:function(t,n,i){return-1==t.indexOf("=?")&&(i=i||this.callbackParam,t+=-1==t.indexOf("?")?"?":"&",t+=i+"=?"),e.ajax({url:t,dataType:"jsonp",data:n})},post:function(n,i){return e.ajax({url:n,data:t.toJSON(i),type:"POST",contentType:"application/json",dataType:"json"})}}});
define('plugins/observable',["durandal/system","durandal/binder","knockout"],function(e,t,n){function i(e){var t=e[0];return"_"===t||"$"===t}function r(t){if(!t||e.isElement(t)||t.ko===n||t.jquery)return!1;var i=d.call(t);return-1==f.indexOf(i)&&!(t===!0||t===!1)}function a(e,t){var n=e.__observable__,i=!0;if(!n||!n.__full__){n=n||(e.__observable__={}),n.__full__=!0,v.forEach(function(n){e[n]=function(){i=!1;var e=m[n].apply(t,arguments);return i=!0,e}}),g.forEach(function(n){e[n]=function(){i&&t.valueWillMutate();var r=h[n].apply(e,arguments);return i&&t.valueHasMutated(),r}}),p.forEach(function(n){e[n]=function(){for(var r=0,a=arguments.length;a>r;r++)o(arguments[r]);i&&t.valueWillMutate();var s=h[n].apply(e,arguments);return i&&t.valueHasMutated(),s}}),e.splice=function(){for(var n=2,r=arguments.length;r>n;n++)o(arguments[n]);i&&t.valueWillMutate();var a=h.splice.apply(e,arguments);return i&&t.valueHasMutated(),a};for(var r=0,a=e.length;a>r;r++)o(e[r])}}function o(t){var o,s;if(r(t)&&(o=t.__observable__,!o||!o.__full__)){if(o=o||(t.__observable__={}),o.__full__=!0,e.isArray(t)){var l=n.observableArray(t);a(t,l)}else for(var u in t)i(u)||o[u]||(s=t[u],e.isFunction(s)||c(t,u,s));b&&e.log("Converted",t)}}function s(e,t,n){var i;e(t),i=e.peek(),n?i.destroyAll||(i||(i=[],e(i)),a(i,e)):o(i)}function c(t,i,r){var c,l,u=t.__observable__||(t.__observable__={});if(void 0===r&&(r=t[i]),e.isArray(r))c=n.observableArray(r),a(r,c),l=!0;else if("function"==typeof r){if(!n.isObservable(r))return null;c=r}else e.isPromise(r)?(c=n.observable(),r.then(function(t){if(e.isArray(t)){var i=n.observableArray(t);a(t,i),t=i}c(t)})):(c=n.observable(r),o(r));return Object.defineProperty(t,i,{configurable:!0,enumerable:!0,get:c,set:n.isWriteableObservable(c)?function(t){t&&e.isPromise(t)?t.then(function(t){s(c,t,e.isArray(t))}):s(c,t,l)}:void 0}),u[i]=c,c}function l(t,n,i){var r,a=this,o={owner:t,deferEvaluation:!0};return"function"==typeof i?o.read=i:("value"in i&&e.error('For ko.defineProperty, you must not specify a "value" for the property. You must provide a "get" function.'),"function"!=typeof i.get&&e.error('For ko.defineProperty, the third parameter must be either an evaluator function, or an options object containing a function called "get".'),o.read=i.get,o.write=i.set),r=a.computed(o),t[n]=r,c(t,n,r)}var u,d=Object.prototype.toString,f=["[object Function]","[object String]","[object Boolean]","[object Number]","[object Date]","[object RegExp]"],v=["remove","removeAll","destroy","destroyAll","replace"],g=["pop","reverse","sort","shift","splice"],p=["push","unshift"],h=Array.prototype,m=n.observableArray.fn,b=!1;return u=function(e,t){var i,r,a;return e?(i=e.__observable__,i&&(r=i[t])?r:(a=e[t],n.isObservable(a)?a:c(e,t,a))):null},u.defineProperty=l,u.convertProperty=c,u.convertObject=o,u.install=function(e){var n=t.binding;t.binding=function(e,t,i){i.applyBindings&&!i.skipConversion&&o(e),n(e,t)},b=e.logConversion},u});
define('plugins/serializer',["durandal/system"],function(e){return{typeAttribute:"type",space:void 0,replacer:function(e,t){if(e){var n=e[0];if("_"===n||"$"===n)return void 0}return t},serialize:function(t,n){return n=void 0===n?{}:n,(e.isString(n)||e.isNumber(n))&&(n={space:n}),JSON.stringify(t,n.replacer||this.replacer,n.space||this.space)},getTypeId:function(e){return e?e[this.typeAttribute]:void 0},typeMap:{},registerType:function(){var t=arguments[0];if(1==arguments.length){var n=t[this.typeAttribute]||e.getModuleId(t);this.typeMap[n]=t}else this.typeMap[t]=arguments[1]},reviver:function(e,t,n,i){var r=n(t);if(r){var a=i(r);if(a)return a.fromJSON?a.fromJSON(t):new a(t)}return t},deserialize:function(e,t){var n=this;t=t||{};var i=t.getTypeId||function(e){return n.getTypeId(e)},r=t.getConstructor||function(e){return n.typeMap[e]},a=t.reviver||function(e,t){return n.reviver(e,t,i,r)};return JSON.parse(e,a)}}});
define('plugins/widget',["durandal/system","durandal/composition","jquery","knockout"],function(e,t,n,i){function r(e,n){var r=i.utils.domData.get(e,u);r||(r={parts:t.cloneNodes(i.virtualElements.childNodes(e))},i.virtualElements.emptyNode(e),i.utils.domData.set(e,u,r)),n.parts=r.parts}var a={},o={},c=["model","view","kind"],u="durandal-widget-data",s={getSettings:function(t){var n=i.utils.unwrapObservable(t())||{};if(e.isString(n))return{kind:n};for(var r in n)n[r]=-1!=i.utils.arrayIndexOf(c,r)?i.utils.unwrapObservable(n[r]):n[r];return n},registerKind:function(e){i.bindingHandlers[e]={init:function(){return{controlsDescendantBindings:!0}},update:function(t,n,i,a,o){var c=s.getSettings(n);c.kind=e,r(t,c),s.create(t,c,o,!0)}},i.virtualElements.allowedBindings[e]=!0},mapKind:function(e,t,n){t&&(o[e]=t),n&&(a[e]=n)},mapKindToModuleId:function(e){return a[e]||s.convertKindToModulePath(e)},convertKindToModulePath:function(e){return"widgets/"+e+"/viewmodel"},mapKindToViewId:function(e){return o[e]||s.convertKindToViewPath(e)},convertKindToViewPath:function(e){return"widgets/"+e+"/view"},createCompositionSettings:function(e,t){return t.model||(t.model=this.mapKindToModuleId(t.kind)),t.view||(t.view=this.mapKindToViewId(t.kind)),t.preserveContext=!0,t.activate=!0,t.activationData=t,t.mode="templated",t},create:function(e,n,i,r){r||(n=s.getSettings(function(){return n},e));var a=s.createCompositionSettings(e,n);t.compose(e,a,i)},install:function(e){if(e.bindingName=e.bindingName||"widget",e.kinds)for(var t=e.kinds,n=0;n<t.length;n++)s.registerKind(t[n]);i.bindingHandlers[e.bindingName]={init:function(){return{controlsDescendantBindings:!0}},update:function(e,t,n,i,a){var o=s.getSettings(t);r(e,o),s.create(e,o,a,!0)}},i.virtualElements.allowedBindings[e.bindingName]=!0}};return s});
define('transitions/entrance',["durandal/system","durandal/composition","jquery"],function(e,t,n){var i=100,r={marginRight:0,marginLeft:0,opacity:1},o={marginLeft:"",marginRight:"",opacity:"",display:""},a=function(t){return e.defer(function(e){function a(){e.resolve()}function c(){t.keepScrollPosition||n(document).scrollTop(0)}function u(){c(),t.triggerAttach();var e={marginLeft:l?"0":"20px",marginRight:l?"0":"-20px",opacity:0,display:"block"},i=n(t.child);i.css(e),i.animate(r,s,"swing",function(){i.css(o),a()})}if(t.child){var s=t.duration||500,l=!!t.fadeOnly;t.activeView?n(t.activeView).fadeOut(i,u):u()}else n(t.activeView).fadeOut(i,a)}).promise()};return a});

require(["main"]);
}());
