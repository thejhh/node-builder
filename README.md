node-builder
============

I wrote this small bit of code to make it easier to create static JavaScript 
programs. It automatically “compiles” your own built-in 3rd party JavaScript 
file(s) with [Node.js](http://www.nodejs.org) as a single standalone binary file. It’s still far from 
perfect and more like a proof of concept than an actual program.

Our test file [dummy.js](https://github.com/jheusala/node-builder/blob/master/dummy.js) looks like this:

    console.log("I am a dummy.js");

You can compile it by running:

    $ node-builder.js -q -o dummy dummy.js

...and execute the binary file in usual way:

    $ ./dummy
    I am a dummy.js

Resulting binary file is a real binary file:

    $ file dummy
    dummy: ELF 32-bit LSB executable, Intel 80386, version 1 (SYSV), dynamically linked (uses shared libs), for GNU/Linux 2.6.18, not stripped

Only ./dummy file is needed to execute your program. Nothing else needs to be 
installed. (Except external modules, which node-builder doesn’t include in the 
executable (unless provided with the binary) but I probably will figure some 
way to support those too.)

This all works by using 3rd party support in Node.js. 
At the moment it does not actually precompile the source code into the 
executable like it is done for the standard library with 
[Google v8](http://code.google.com/p/v8/). Maybe that will be supported someday. The 
code is simply included as it is inside the binary.
