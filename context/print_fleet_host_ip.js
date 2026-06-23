/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

require('@kbn/setup-node-env');

const { resolveLocalhostRealIp } = require('../x-pack/solutions/security/plugins/security_solution/scripts/endpoint/common/network_services');

void resolveLocalhostRealIp().then((ip) => {
  process.stdout.write(ip);
});
