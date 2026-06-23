/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { networkInterfaces } from 'node:os';
import net from 'node:net';

export interface Ipv4Candidate {
  address: string;
  interfaceName: string;
}

export type TcpProbeResult = 'open' | 'refused' | 'timeout';

const DEFAULT_FLEET_PROBE_PORT = 8220;

/** Subnets that are commonly picked by mistake and fail multipass or host health checks. */
export const isExcludedFleetHostIp = (address: string): boolean => {
  if (address.startsWith('127.') || address.startsWith('169.254.')) {
    return true;
  }

  // OrbStack / Docker Desktop bridge — often unreachable from multipass VMs.
  if (address.startsWith('192.168.139.')) {
    return true;
  }

  // Default Docker bridge ranges.
  if (address.startsWith('172.17.') || address.startsWith('172.18.')) {
    return true;
  }

  return false;
};

export const getInterfacePriority = (interfaceName: string): number => {
  const enMatch = /^en(\d+)$/.exec(interfaceName);
  if (enMatch) {
    return 100 - Number(enMatch[1]);
  }

  if (interfaceName === 'eth0') {
    return 90;
  }

  if (/^bridge|^br-/.test(interfaceName) || /^docker/.test(interfaceName)) {
    return 10;
  }

  if (/^utun/.test(interfaceName)) {
    return 20;
  }

  return 50;
};

export const getCandidateIpv4Addresses = (): Ipv4Candidate[] => {
  const candidates: Ipv4Candidate[] = [];

  for (const [interfaceName, netInterfaceList] of Object.entries(networkInterfaces())) {
    if (!netInterfaceList) {
      continue;
    }

    for (const networkInterface of netInterfaceList) {
      if (
        networkInterface.family !== 'IPv4' ||
        networkInterface.internal ||
        !networkInterface.address ||
        networkInterface.address.endsWith('.0') ||
        isExcludedFleetHostIp(networkInterface.address)
      ) {
        continue;
      }

      candidates.push({
        address: networkInterface.address,
        interfaceName,
      });
    }
  }

  return candidates.sort(
    (left, right) => getInterfacePriority(right.interfaceName) - getInterfacePriority(left.interfaceName)
  );
};

export const probeTcpReachability = async (
  host: string,
  port: number,
  timeoutMs = 1500
): Promise<TcpProbeResult> => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result: TcpProbeResult) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish('open'));
    socket.once('timeout', () => finish('timeout'));
    socket.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ECONNREFUSED') {
        finish('refused');
        return;
      }

      finish('timeout');
    });
    socket.connect(port, host);
  });
};

export const pickFleetHostIpFromCandidates = async (
  candidates: readonly Ipv4Candidate[],
  port = DEFAULT_FLEET_PROBE_PORT,
  probe: (host: string, probePort: number) => Promise<TcpProbeResult> = probeTcpReachability
): Promise<string | undefined> => {
  if (candidates.length === 0) {
    return undefined;
  }

  const probeResults = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      probe: await probe(candidate.address, port),
    }))
  );

  const open = probeResults.find(({ probe }) => probe === 'open');
  if (open) {
    return open.candidate.address;
  }

  const refused = probeResults.find(({ probe }) => probe === 'refused');
  if (refused) {
    return refused.candidate.address;
  }

  return undefined;
};

export const getLocalhostRealIpHeuristic = (): string => {
  return getCandidateIpv4Addresses()[0]?.address ?? '0.0.0.0';
};

export const resolveLocalhostRealIp = async (options?: {
  port?: number;
}): Promise<string> => {
  if (process.env.KIBANA_LOCALHOST_REAL_IP) {
    return process.env.KIBANA_LOCALHOST_REAL_IP;
  }

  const port = options?.port ?? Number(process.env.KIBANA_FLEET_PROBE_PORT ?? DEFAULT_FLEET_PROBE_PORT);
  const candidates = getCandidateIpv4Addresses();
  const probed = await pickFleetHostIpFromCandidates(candidates, port);

  if (probed) {
    return probed;
  }

  return getLocalhostRealIpHeuristic();
};

export const getLocalhostRealIp = (): string => {
  if (process.env.KIBANA_LOCALHOST_REAL_IP) {
    return process.env.KIBANA_LOCALHOST_REAL_IP;
  }

  return getLocalhostRealIpHeuristic();
};
