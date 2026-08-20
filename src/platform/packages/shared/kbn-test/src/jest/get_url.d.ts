interface UrlParam {
    hash?: string;
    host?: string;
    hostname?: string;
    href?: string;
    password?: string;
    pathname?: string;
    port?: number;
    protocol?: string;
    search?: string;
    username?: string;
}
/**
 * Converts a config and a pathname to a url
 * @param {object} config A url config
 *   example:
 *   {
 *      protocol: 'http',
 *      hostname: 'localhost',
 *      port: 9220,
 *      auth: kibanaTestUser.username + ':' + kibanaTestUser.password
 *   }
 * @param {object} app The params to append
 *   example:
 *   {
 *      pathname: 'app/kibana',
 *      hash: '/discover'
 *   }
 * @return {string}
 */
declare function getUrl(config: UrlParam, app: UrlParam): string;
declare namespace getUrl {
    var noAuth: (config: UrlParam, app: UrlParam) => string;
    var baseUrl: (config: UrlParam) => string;
}
export { getUrl };
