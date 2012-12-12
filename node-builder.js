#!/usr/bin/env node
/* node-builder
 * Copyright 2011 Jaakko-Heikki Heusala <jheusala@iki.fi>
 */

function load_module(name) {
	try {
		return require(name);
	} catch(e) {
	}
}

function error(msg) {
	console.log("ERROR: " + msg);
	return;
}

function main() {
	
	function no_module_msg(name) {
		return "Could not load module " + name + "\n\nTo install it use:\n    npm install " + name + "\n";
	}
	
	// Prepare modules
	var fs = load_module('fs');
	if(!fs) return error(no_module_msg('fs'));
	
	var optimist = load_module('optimist');
	if(!optimist) return error(no_module_msg('optimist'));
	
	var path = load_module('path');
	if(!path) return error(no_module_msg('path'));
	
	var child_process = load_module('child_process');
	if(!child_process) return error(no_module_msg('child_process'));
	
	// Parse arguments
	var args = optimist.usage('Usage: $0 [-q] [--tmpdir=DIR] -o FILE [file(s)]')
		.default('o', 'a.out')
		.default('tmpdir', './tmp')
		.default('distfile', 'http://nodejs.org/dist/v0.8.15/node-v0.8.15.tar.gz')
		.demand(['o'])
		.argv;

	var source_files = args._;
	if(source_files.length === 0) return error("You need to specify at least one script file.");
	var quiet = args.q;
	
	/* Async preparation for directory */
	function prep_dir (name, next) {
		if(!quiet) console.log("Preparing directory " + name );
		fs.exists(name, function(exists) {
			if(exists) return next();
			fs.mkdir(name, "0700", function(err) { next(err); });
		});
	}
	
	/* Async preparation for remote files */
	function prep_distfiles (distfile, tofile, next) {
		if(!quiet) console.log("Preparing distfile " + distfile + " to " + tofile);
		fs.exists(tofile, function(exists) {
			if(exists) return next();
			if(!quiet) console.log("Downloading " + distfile + " to " + tofile);
			var wget  = child_process.spawn('wget', ['-O', tofile, distfile]);
			wget.stdin.end();
			if(!quiet) wget.stdout.on('data', function (data) { console.log(""+data); });
			if(!quiet) wget.stderr.on('data', function (data) { console.log(""+data); });
			wget.on('exit', function (code) {
				if(code !== 0) next(new TypeError('wget exited with code ' + code));
				next();
			});
		});
	}
	
	/* Async check file md5sum */
	function check_md5sum (name, sum, next) {
		if(!quiet) console.log("Checking md5sum for " + name + " ... [NOT IMPLEMENTED!]" );
		next();
	}
	
	/* For make & make install etc */
	function doexec (name, cmdargs, next) {
		if(!quiet) console.log("Running "+name+" " + cmdargs.join(" ") + "..." );
		var c = child_process.spawn(name, cmdargs);
		c.stdin.end();
		if(!quiet) c.stdout.on('data', function (data) { console.log(""+data); });
		if(!quiet) c.stderr.on('data', function (data) { console.log(""+data); });
		c.on('exit', function (code) {
			if(code !== 0) next(new TypeError(name+' exited with code ' + code));
			next();
		});
	}
		
	/* Async unpack tar.gz */
	function prep_unpack_tgz (name, dir, next) {
		if(!quiet) console.log("Checking " + dir + "/configure..." );
		fs.exists(dir+"/configure", function(exists) {
			if(exists) return next();
			if(!quiet) console.log("Unpacking " + name + " to " + dir);
			var tar  = child_process.spawn('tar', ['--strip-components=1', '-C', dir, '-zxf', name]);
			if(!quiet) tar.stdout.on('data', function (data) { console.log(""+data); });
			if(!quiet) tar.stderr.on('data', function (data) { console.log(""+data); });
			tar.on('exit', function (code) {
				if(code !== 0) next(new TypeError('tar exited with code ' + code));
				next();
			});
		});
	}
	
	/* Async preparation for source files */
	function prep_source_files (srcdir, files, next) {
		if(!quiet) console.log("Preparing source files into " + srcdir + "..." );
		var file = files[0];
		if(!file) next("no files!");
		fs.readFile(srcdir+'/node.gyp', 'utf8', function(err, data) {
			if(err) return error('Could not read node.gyp: ' + err);

			data = data.replace(
				"'lib/_linklist.js',",
				"'lib/_linklist.js', 'lib/_third_party_main.js',"
			);

			fs.writeFile(srcdir+'/node.gyp', data, 'utf8', function(err) {
				if(err) return error('Could not write node.gyp: ' + err);

				doexec("cp", ["-f", file, srcdir+"/lib/_third_party_main.js"], function(err) {
					if(err) return error('Could not prepare _third_party_main.js: ' + err);
					next();
				});
			});
		});
	}
	
	/* Change directory */
	function chdir(dir, next) {
		if(!quiet) console.log('Changing to directory: ' + dir);
		try {
			process.chdir(dir);
			next();
		} catch (err) {
			next('chdir: ' + err);
		}
	}
		
	/* Compile node */
	function compile_node (srcdir, installdir, prefix, next) {
		
		if(!quiet) console.log("Preparing destdir... ");
		doexec("mkdir", ["-p", installdir+prefix], function(err) {
			if(err) return error('Could prepare destdir: ' + err);
			if(!quiet) console.log("Changing to "+ srcdir +"... ");
			chdir(srcdir, function(err) {
				if(err) return error('Could change directory: ' + err);
				doexec("./configure", ["--prefix="+prefix], function(err) {
					if(err) return error('Could not configure: ' + err);
					doexec("make", [], function(err) {
						if(err) return error('Could not make: ' + err);
						if(!quiet) console.log("Installing to "+ installdir +"... ");
						doexec("make", ["DESTDIR="+installdir, "install"], function(err) {
							if(err) return error('Could not make install: ' + err);
							next();
						});
					});
				});
			});
		});
	}
	
	/* Async preparation for output file */
	function prep_output_file (bindir, outfile, next) {
		if(!quiet) console.log("Installing to " + outfile + "..." );
		doexec("cp", ["-f", bindir+"/node", outfile], function(err) {
			if(err) return next('Could not install '+outfile+': ' + err);
			next();
		});
	}
	
	/* Async builder cycle */
	if(!quiet) console.log("Building... ");
	var outputfile = path.resolve(path.normalize(args.o));
	var prefix = "/opt/node";
	var tmpdir = path.resolve(path.normalize(args.tmpdir));
	prep_dir(tmpdir, function(err) {
		if(err) return error('Could not prepare: ' + tmpdir + ': ' + err);
		var sourcefile = tmpdir + '/node.tar.gz';
		prep_distfiles(args.distfile, sourcefile, function(err) {
			if(err) return error('Could not prepare: ' + args.distfile + ' to ' + sourcefile + ': ' + err);
			check_md5sum(sourcefile, "a2a6a6699e275a30f6047b1f33281a77", function(err) {
				if(err) return error('Hash failed for ' + sourcefile);
				var distdir = tmpdir + "/node";
				var installdir = tmpdir + "/destdir";
				prep_dir(distdir, function(err) {
					if(err) return error('Could not prepare: ' + distdir + ': ' + err);
					prep_unpack_tgz(sourcefile, distdir, function(err) {
						if(err) return error('Unpack failed for ' + sourcefile + ": " + err);
						prep_source_files(distdir, source_files, function(err) {
							if(err) return error('Preparing for source files failed: ' + err);
							compile_node(distdir, installdir, prefix, function(err) {
								if(err) return error('Compiling node failed: ' + err);
								prep_output_file(installdir+prefix+"/bin", outputfile, function(err) {
									if(err) return error('Installing binary failed: ' + err);
									if(!quiet) console.log("OK!");
								});
							});
						});
					});
				});
			});
		});
	});
}

main();
/* EOF */
