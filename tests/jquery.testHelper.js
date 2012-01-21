/*
 * mobile support unit tests
 */

(function( $ ) {
	$.testHelper = {
		// This function takes sets of files to load asynchronously. Each set will be loaded after
		// the previous set has completed loading. That is, each require and it's dependencies in a
		// set will be loaded asynchronously, but each set will be run in serial.
		asyncLoad: function( seq ) {
			var results = /[\\?&]jquery=([^&#]*)/.exec( location.search ), version, defaultVersion;

			// if the user has defined a version of jquery in the query params
      // get rid of jquery and push the version of jquery we want to load on to
      // the async load stack
			if( results ) {
				defaultVersion = $().jquery;

				// make sure the version of jquery that's in the page by default is unloaded
				window.jQuery = window.$ = undefined;
				version = decodeURIComponent(results[results.length - 1].replace(/\+/g, " "));
				if( window.console ) console.log( "!!! Reloading jquery as v" + version );
				seq.unshift( ["order!jquery-" + version] );
			}

			require({
				baseUrl: "../../../js"
			});

			function loadSeq( seq, i ){
				if( !seq[i] ){
					$( document ).ready( function() {
						var $fixture = $( '#qunit-fixture' );
						if ( $fixture.length ) {
							QUnit.config.fixture = $fixture.html();
						}

						QUnit.start();
					});

					return;
				}

				require( seq[i], function() {
					// NOTE the window.$() because $ is the old version in this context
					// if we're loading jquery check that the jquery version has changed, otherwise
					// warn the user in the console
					if( seq[i][0].indexOf("jquery-") > -1 && window.$().jquery === defaultVersion && window.console ){
						console.log( "!!! The default version === search param version, ie " + defaultVersion);
					}

					loadSeq(seq, i + 1);
				});
			}

			// stop qunit from running the tests until everything is in the page
			QUnit.config.autostart = false;

			loadSeq( seq, 0 );
		},

		excludeFileProtocol: function(callback){
			var message = "Tests require script reload and cannot be run via file: protocol";

			if (location.protocol == "file:") {
				test(message, function(){
					ok(false, message);
				});
			} else {
				callback();
			}
		},

		// TODO prevent test suite loads when the browser doesn't support push state
		// and push-state false is defined.
		setPushState: function() {
			if( $.support.pushState && location.search.indexOf( "push-state" ) >= 0 ) {
				$.support.pushState = false;
			}
		},

		reloads: {},

		reloadModule: function(libName){
			var deferred = $.Deferred(),
				context;

			// where a module loader isn't defined use the old way
			if( !window.require ) {
				this.reloadLib( libName );
				deferred.resolve();
				return deferred;
			}

			if(this.reloads[libName] === undefined) {
				this.reloads[libName] = {
					count: 0
				};
			}

			//Clear internal cache of module inside of require
			context = require.s.contexts._;
			delete context.defined[libName];
			delete context.specified[libName];
			delete context.loaded[libName];
			delete context.urlFetched[require.toUrl(libName + '.js')];

			require(
				{
					baseUrl: "../../../js"
				}, [libName],
				function() {
					deferred.resolve();
				}
			);

			return deferred;
		},

		reloadLib: function(libName){
			if(this.reloads[libName] === undefined) {
				this.reloads[libName] = {
					lib: $("script[src$='" + libName + "']"),
					count: 0
				};
			}

			var lib = this.reloads[libName].lib.clone(),
				src = lib.attr('src');

			//NOTE append "cache breaker" to force reload
			lib.attr('src', src + "?" + this.reloads[libName].count++);
			$("body").append(lib);
		},

		rerunQunit: function(){
			var self = this;
			QUnit.init();
			$("script:not([src*='.\/'])").each(function(i, elem){
				var src = elem.src.split("/");
				self.reloadLib(src[src.length - 1]);
			});
			QUnit.start();
		},

		alterExtend: function(extraExtension){
			var extendFn = $.extend;

			$.extend = function(object, extension){
				// NOTE extend the object as normal
				var result = extendFn.apply(this, arguments);

				// NOTE add custom extensions
				result = extendFn(result, extraExtension);
				return result;
			};
		},

		hideActivePageWhenComplete: function() {
			if( $('#qunit-testresult').length > 0 ) {
				$('.ui-page-active').css('display', 'none');
			} else {
				setTimeout($.testHelper.hideActivePageWhenComplete, 500);
			}
		},

		openPage: function(hash){
			location.href = location.href.split('#')[0] + hash;
		},

		sequence: function(fns, interval){
			$.each(fns, function(i, fn){
				setTimeout(fn, i * interval);
			});
		},

		pageSequence: function(fns){
			this.eventSequence("pagechange", fns);
		},

		eventSequence: function(event, fns, timedOut){
			var fn = fns.shift(),
					self = this;

			if( fn === undefined ) return;

			// if a pagechange or defined event is never triggered
			// continue in the sequence to alert possible failures
			var warnTimer = setTimeout(function(){
				self.eventSequence(event, fns, true);
			}, 2000);

			// bind the recursive call to the event
			$.mobile.pageContainer.one(event, function(){
				clearTimeout(warnTimer);

				// Let the current stack unwind before we fire off the next item in the sequence.
				// TODO setTimeout(self.pageSequence, 0, [fns, event]);
				setTimeout(function(){ self.eventSequence(event, fns); }, 0);
			});

			// invoke the function which should, in some fashion,
			// trigger the defined event
			fn(timedOut);
		},

		deferredSequence: function(fns) {
			var fn = fns.shift(),
				deferred = $.Deferred(),
				self = this;

			if (fn) {
				res = fn();
				if ( res && $.type( res.done ) === "function" ) {
					res.done(
						function() {
							self.deferredSequence( fns ).done(
								function() {
									deferred.resolve();
								}
							);
						}
					)
				} else {
					self.deferredSequence( fns ).done(
						function() {
							deferred.resolve();
						}
					);

				}
			} else {
				deferred.resolve();
			}
			return deferred;
		},

		decorate: function(opts){
			var thisVal = opts.self || window;

			return function(){
				var returnVal;
				opts.before && opts.before.apply(thisVal, arguments);
				returnVal = opts.fn.apply(thisVal, arguments);
				opts.after && opts.after.apply(thisVal, arguments);

				return returnVal;
			};
		},

		assertUrlLocation: function( args ) {
			var parts = $.mobile.path.parseUrl( location.href ),
				pathnameOnward = location.href.replace( parts.domain, "" );

			if( $.support.pushState ) {
				same( pathnameOnward, args.hashOrPush || args.push, args.report );
			} else {
				same( parts.hash, "#" + (args.hashOrPush || args.hash), args.report );
			}
		}
	};
})(jQuery);
