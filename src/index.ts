#!/usr/bin/env node

import { spawn } from 'child_process';
import * as fs from 'fs';
import minimist from 'minimist';
import fetch from 'node-fetch';
import pLimit from 'p-limit';
const version = require('./package.json').version;

const argv = minimist(process.argv.slice(2));
if (argv['version']) {
    console.log(version);
    process.exit();
} else if (argv._.length < 2 || argv['h'] || argv['help']) {
    console.log('Helioviewer video exporter.')
    console.log();
    console.log('Usage:');
    console.log(`  ${process.argv[0]} ${process.argv[1]} <startdate> <enddate> [options]`);
    console.log();
    console.log('Options:')
    console.log('  --fps=<fps>                 Frames per second [default: 15].');
    console.log('  --frames=<frames>           Number of frames [default: 300].');
    console.log('  -h, --help                  Show this screen.');
    console.log('  -o <file>, --output=<file>  Output file [default: output.mp4]')
    console.log('  --version                   Show version.');
    console.log();
    console.log('Example:');
    console.log(`  ${process.argv[0]} ${process.argv[1]} 2012-03-08T00:00:00Z 2012-03-13T00:00:00Z`)
    process.exit();
}

const startdate = new Date(argv._[0]);
const enddate = new Date(argv._[1]);
const fps = +argv['fps'] || 15;
const frames = +argv['frames'] || 300;
const output = argv['o'] || argv['output'] || 'output.mp4';

const diff = enddate.getTime() - startdate.getTime();
const limit = pLimit(3);
let promises = [];
for (let i = 0; i < frames; i++) {
    const date = new Date(startdate.getTime() + i * (diff / frames)).toISOString();
    const promise = limit(() => fetch(`https://api.helioviewer.org/v2/getJP2Image/?date=${date}&sourceId=10`).then(res => {
        const dest = fs.createWriteStream(`${`${i}`.padStart(frames.toString().length, '0')}.jp2`);
        const stream = res.body.pipe(dest);
        return new Promise(fulfill => stream.on('finish', fulfill));
    }));
    promises.push(promise);
}

let downloadProgress = 0.0;
(async () => {
    await Promise.all(promises.map(promise => promise.catch(e => e)).map(promise => promise.then(value => {
        process.stdout.write(`Downloading images... ${((++downloadProgress / frames) * 100).toFixed(2)}%${downloadProgress === frames ? '\n' : '\r'}`);
    })));
    console.log('Creating video from images using ffmpeg...');
    const proc = spawn('ffmpeg', [
        '-y',
        '-r', fps.toString(),
        '-i', '%03d.jp2',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        output,
    ], {
        stdio: 'inherit'
    });
    proc.on('close', (code, signal) => {
        let deleteProgress = 0.0;
        for (let i = 0; i < frames; i++) {
            fs.unlink(`${`${i}`.padStart(frames.toString().length, '0')}.jp2`, err => {
                process.stdout.write(`Deleting images... ${((++deleteProgress / frames) * 100).toFixed(2)}%${deleteProgress === frames ? '\n' : '\r'}`);
            });
        }
    });
})();
