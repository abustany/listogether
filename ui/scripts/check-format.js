#!/usr/bin/env node

import { spawnSync } from "node:child_process";

/** @type {RegExp[]} */
const FILES_TO_CHECK = [/^ui\/.*\.(js|jsx|ts|tsx)$/];

/**
 * Prints a message and exits with status 1.
 *
 * @param {string} message - the message to print before dying
 */
function die(message) {
  console.log(message);
  process.exit(1);
}

/**
 * Runs a command and returns the result decoded as UTF-8.
 *
 * Dies if the command fails to launch, or returns a non-0 status.
 *
 * @param {string} command - the command to run
 * @param {string[]} args - the command line arguments (excluding the command itself)
 * @param {import("node:child_process").SpawnSyncOptions | undefined} - additional options to pass to Node's spawnSync
 * @returns {string} - the commands stdout.
 */
function exec(command, args, options) {
  const res = spawnSync(command, args, { env: { PATH: process.env.PATH }, encoding: "utf8", ...options });
  if (res.error) {
    die(`${command} failed to start: ${res.error}`);
  } else if (res.status !== 0) {
    die(`${command} exited with status ${res.status}: ${res.stderr}`);
  }

  if (res.stderr !== "") {
    process.stderr.write(res.stderr);
  }

  return res.stdout;
}

/**
 * @param {string} filename - the filename to check
 * @returns {boolean} - whether the file should be processed by this script
 */
function shouldCheckFile(filename) {
  for (const re of FILES_TO_CHECK) {
    if (re.test(filename)) return true;
  }

  return false;
}

/** @typedef {{mode: string, filename: string, object_sha: string}[]} DiffEntry */

/**
 * @param {string} s - the output of git diff-index -z
 * @returns {DiffEntry[]} - the parsed entries
 */
function parseDiffEntries(s) {
  const tokens = s.split("\0");

  if (tokens.length === 0 || tokens[tokens.length - 1] !== "") throw new Error(`expected a trailing \0`);
  tokens.splice(tokens.length - 1, 1);

  if (tokens.length % 2 !== 0) throw new Error(`invalid number of tokens: ${tokens.length}`);

  /** @type {DiffEntry[]} */
  const entries = [];

  for (let i = 0; i < tokens.length; i += 2) {
    const metaTokens = tokens[i].split(" ");
    if (metaTokens.length !== 5) throw new Error(`invalid meta at index ${i}: ${tokens[i]}`);

    entries.push({ mode: metaTokens[1], filename: tokens[i + 1], object_sha: metaTokens[3] });
  }

  return entries;
}

/**
 * @param {string} sha - the ID of the object to read
 * @return {string} - the object data, decoded as UTF-8
 */
function readGitObject(sha) {
  return exec("git", ["cat-file", "-p", sha]);
}

/**
 * Runs oxfmt on the given data.
 *
 * filename is only used to produce better diagnostics.
 *
 * @param {string} - filename
 * @param {string} - data
 * @return {string} - the formatted data
 */
function formatFile(filename, data) {
  return exec("oxfmt", ["--stdin-filepath", filename], { input: data });
}

/*****************************************************************************/

/** @type {string[]} */
const invalidFormatFiles = [];

for (const entry of parseDiffEntries(
  exec("git", ["diff-index", "-z", "--cached", "--diff-filter=AM", "--no-renames", "HEAD"]),
)) {
  if (entry.mode === "120000" /* skip symlinks */ || !shouldCheckFile(entry.filename)) continue;

  const originalData = readGitObject(entry.object_sha);
  const formatted = formatFile(entry.filename, originalData);

  if (originalData !== formatted) invalidFormatFiles.push(entry.filename);
}

if (invalidFormatFiles.length > 0) {
  die(`The following files need to be formatted first:\n${invalidFormatFiles.map((x) => "  " + x).join("\n")}`);
}
