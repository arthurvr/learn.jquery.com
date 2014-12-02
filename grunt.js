var rimraf = require( "rimraf" ),
	config = require( "./config" );

module.exports = function( grunt ) {

"use strict";

grunt.loadNpmTasks( "grunt-wordpress" );
grunt.loadNpmTasks( "grunt-jquery-content" );
grunt.loadNpmTasks( "grunt-check-modules" );

grunt.initConfig({
	jshint: {
		options: {
			undef: true,
			node: true
		}
	},
	lint: {
		grunt: "grunt.js"
	},
	watch: {
		pages: {
			files: "page/**",
			tasks: "deploy"
		}
	},
	"build-pages": {
		all: grunt.file.expandFiles( "page/**" )
	},
	"build-resources": {
		all: grunt.file.expandFiles( "resources/**/*" )
	},
	wordpress: grunt.utils._.extend({
		dir: "dist/wordpress"
	}, grunt.file.readJSON( "config.json" ) )
});

grunt.registerTask( "clean", function() {
	rimraf.sync( "dist" );
});

// Process a JSON order file and return an object of page slugs and their ordinal indices
grunt.registerHelper( "read-order", function( orderFile ) {
	var order,
		map = {},
		index = 0;

	try {
		order = JSON.parse( grunt.file.read( orderFile ) );
	} catch( error ) {
		grunt.warn( "Invalid order file: " + orderFile );
		return null;
	}


	function flatten( item, folder ) {
		var title,
		path = folder ? [ folder ] : [];

		if ( grunt.utils._.isObject( item ) ) {
			title = Object.keys( item )[ 0 ];
			path.push( title );
			path = path.join( "/" );
			map[ path ] = ++index;

			item[ title ].forEach(function( item ) {
				flatten( item, path );
			});
		} else {
			path.push( item );
			map[ path.join( "/" ) ] = ++index;
		}
	}
	order.forEach(function( item ) {
		flatten( item );
	});
	return map;
});

grunt.registerHelper( "contributor-attribution", function( post, fileName, fn ) {
	var contribs = [],
		_ = grunt.utils._,
		parseRE = /^(.*)<(.*)>$/; // could certainly be better.

	// Read contributors from git file information
	grunt.utils.spawn({
		cmd: "git",
		args: [
			"log",
			"--follow", // Trace history through file rename operations
			"--diff-filter=AM", // Only consider "Add" and "Modify" operations
			"--format=%aN <%aE>",
			fileName
		]
	}, function( err, result ) {
		if ( err ) {
			grunt.verbose.error();
			grunt.log.error( err );
			return;
		}
		// make unique.
		contribs = _.uniq( result.stdout.split( /\r?\n/g ) );

		// make object { name: 'name', email: 'email@address.com' }
		contribs.forEach(function(str, idx) {
			var m = parseRE.exec(str);
			if ( m ) {
				contribs[idx] = { name: m[1].trim(), email: m[2] };
			}
			else {
				contribs[idx] = { name: str };
			}
		});

		// Alphabetize by 'last name' (relatively crude)
		contribs = _.sortBy( contribs, function(a) {
			return a.name.split(' ').pop().toLowerCase();
		});

		// Handle "legacy" content - content authored outside of the learn site
		// and attributed with metadata in the file,
		// push those contributors to the front of the list
		if ( post.attribution ) {
			post.attribution.forEach(function(str, idx) {
				var contrib, m;

				// Handling specifically for articles originally from jQuery Fundamentals
				if (str == "jQuery Fundamentals") {
					contribs.unshift({
						name: str,
						// Use the jQuery Gravatar
						email: "github@jquery.com",
						source: post.source
					});
				} else {
					m = parseRE.exec(str);
					if ( m ) {
						contrib = { name: m[1].trim(), email: m[2] };
					}
					else {
						contrib = { name: str };
					}
					if ( post.source ) {
						contrib.source = post.source;
					}
					contribs.unshift( contrib );
				}
			});
		}

		if ( post.customFields ) {
			post.customFields.push({
				key: "contributors",
				value: JSON.stringify( contribs )
			});
		} else {
			post.customFields = [{
				key: "contributors",
				value: JSON.stringify( contribs )
			}];
		}

		fn();
	});

});

grunt.registerHelper( "build-pages-preprocess", (function() {
	var orderMap = grunt.helper( "read-order", "order.json" );

	return function( post, fileName, done ) {
		grunt.utils.async.series([
			function applyOrder( fn ) {
				var slug = fileName.replace( /^.+?\/(.+)\.\w+$/, "$1" ),
				menuOrder = orderMap[ slug ];
				if ( menuOrder ) {
					post.menuOrder = menuOrder;
				}
				fn();
			},

			function applyContribs( fn ) {
				grunt.helper( "contributor-attribution", post, fileName, fn );
			}
		], done );
	};
})());

grunt.registerTask( "default", "wordpress-deploy" );
grunt.registerTask( "build-wordpress", "check-modules clean lint build-pages build-resources");
grunt.registerTask( "deploy", "wordpress-deploy" );

};



