/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import uuid from 'uuid';
import { schema } from '@kbn/config-schema';
import moment from 'moment';

import { IRouter } from '../../../../../../src/core/server';

export interface AgentsSelection {
  agents: string[];
  allAgentsSelected: boolean;
  platformsSelected: string[];
  policiesSelected: string[];
}

export const createActionRoute = (router: IRouter) => {
  router.post(
    {
      path: '/internal/osquery/action',
      validate: {
        params: schema.object({}, { unknowns: 'allow' }),
        body: schema.object({}, { unknowns: 'allow' }),
      },
    },
    async (context, request, response) => {
      const esClient = context.core.elasticsearch.client.asInternalUser;
      const selectedAgents: string[] = [];
      const {
        agentSelection: { allAgentsSelected, platformsSelected, policiesSelected, agents },
      } = request.body as { agentSelection: AgentsSelection };
      const extractIds = ({ body }) =>
        body.hits.hits.map((o) => o._source.local_metadata.elastic.agent.id);
      if (allAgentsSelected) {
        // make a query for all agent ids
        const ids = extractIds(
          await esClient.search<{}, {}>({
            index: '.fleet-agents',
            body: {
              _source: 'local_metadata.elastic.agent.id',
              size: 9000,
              query: {
                match_all: {},
              },
            },
          })
        );
        selectedAgents.push(...ids);
      } else if (platformsSelected.length > 0 || policiesSelected.length > 0) {
        const filters: Array<{
          term: { [key: string]: string };
        }> = platformsSelected.map((platform) => ({
          term: { 'local_metadata.os.platform': platform },
        }));
        filters.push(...policiesSelected.map((policyId) => ({ term: { policyId } })));
        const query = {
          index: '.fleet-agents',
          body: {
            _source: 'local_metadata.elastic.agent.id',
            size: 9000,
            query: {
              bool: {
                filter: [
                  {
                    bool: {
                      should: filters,
                    },
                  },
                ],
              },
            },
          },
        };
        const ids = extractIds(await esClient.search<{}, {}>(query));
        selectedAgents.push(...ids);
      } else {
        selectedAgents.push(...agents);
      }
      const action = {
        action_id: uuid.v4(),
        '@timestamp': moment().toISOString(),
        expiration: moment().add(2, 'days').toISOString(),
        type: 'INPUT_ACTION',
        input_type: 'osquery',
        agents: selectedAgents,
        data: {
          id: uuid.v4(),
          // @ts-expect-error update validation
          query: request.body.command,
        },
      };
      const query = await esClient.index<{}, {}>({
        index: '.fleet-actions',
        body: action,
      });

      return response.ok({
        body: {
          response: query,
          action,
        },
      });
    }
  );
};
