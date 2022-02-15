/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

const execa = require('execa');
const deleteInstance = require('./delete_instance');

module.exports = async function (baseCommand, deploymentId) {
  try {
    await execa.command(
      `${baseCommand} --spec cypress/cloud_upgrade_integration/trusted_apps/trusted_apps_post.spec.ts`,
      {
        shell: true,
      }
    );
  } catch (error) {
    console.error('error', error);
    deleteInstance(deploymentId);
  }
};
