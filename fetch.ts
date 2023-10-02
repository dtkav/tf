import { requestUrl } from "obsidian";

export type Callback = (error: any, data: any) => void;

function promiseCallback(
  fn: (resolve: Function, reject: Function) => void,
  cb?: Callback
): Promise<any> | void {
  const promise = new Promise(fn);
  if (!cb) {
    return promise;
  }
  promise
    .then((returnValue) => {
      cb(null, returnValue);
    })
    .catch((error) => {
      cb(error, null);
    });
}

export function fetchData(
  url: string,
  parser: (response: any) => any,
  cb?: Callback
): Promise<any> | void {
  return promiseCallback((resolve, reject) => {
    requestUrl(url, { throw: false })
      .then((response) => {
        if (response.status !== 200) {
          throw Error(`Received status code ${response.status} from an API.`);
        }
        return parser(response);
      })
      .then((data) => {
        console.log("fetched data", data);
        resolve(data);
      })
      .catch((error) => {
        reject(error);
      });
  }, cb);
}

/**
 * Fetches data from a URL and returns it as JSON.
 * @param url - The URL to fetch from.
 * @param cb - Optional callback to handle results.
 * @returns - A Promise with parsed data or void if callback is provided.
 */
export function fetchJSON(url: string, cb?: Callback): Promise<any> | void {
  return fetchData(url, (response) => response.json, cb);
}

/**
 * Fetches data from a URL and returns it as text.
 * @param url - The URL to fetch from.
 * @param cb - Optional callback to handle results.
 * @returns - A Promise with parsed data or void if callback is provided.
 */
export function fetchText(url: string, cb?: Callback): Promise<any> | void {
  return fetchData(url, (response) => response.text, cb);
}
