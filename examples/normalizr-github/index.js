import fs from 'fs';
import https from 'https';
import { normalize } from '@rest-hooks/normalizr';
import path from 'path';

import * as schema from './schema';

let data = '';
const request = https.request(
  {
    host: 'api.github.com',
    path: '/repos/coinbase/rest-hooks/issues',
    method: 'get',
    headers: {
      'user-agent': 'Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 6.0)',
    },
  },
  res => {
    res.on('data', d => {
      data += d;
    });

    res.on('end', () => {
      const normalizedData = normalize(
        JSON.parse(data),
        schema.IssueOrPullRequest,
      );
      const out = JSON.stringify(normalizedData, null, 2);
      fs.writeFileSync(path.resolve(__dirname, './output.json'), out);
    });

    res.on('error', e => {
      console.log(e);
    });
  },
);

request.end();
