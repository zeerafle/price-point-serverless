/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npx wrangler dev src/index.js` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npx wrangler publish src/index.js --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import {listen, Router} from 'worktop';
import faunadb from 'faunadb';
import {getDateAndTime, getFaunaError} from './utils.js';

const router = new Router();

const faunaClient = new faunadb.Client({
    secret: FAUNA_SECRET,
});

const {
    Create,
    Collection,
    Match,
    Index,
    Get,
    Ref,
    Paginate,
    Select
} = faunadb.query;

// Index route to test API was deployed and works
router.add('GET', '/', async (req, res) => {
    res.send(200, 'Price Point API Gateway');
});

// Sending an HTTP POST req to this endpoint creates a new document
// in the "Products" collection and store the price
//
// Expected body:
// {
//     'url': <string>
//     'name': <string>,
//     'picture_url': <string>,
//     'merchant': <string>,
//     'price': <number>,
// }
//
// Expected res:
// {
//     'productId': <string>
// }
router.add('POST', '/products', async (req, res) => {
    try {
        const {url, name, pictureUrl, merchant, price} = await req.body();
        const result = await faunaClient.query(
            Create(
                Collection('Products'),
                {
                    data: {
                        url,
                        name,
                        pictureUrl,
                        merchant
                    }
                }
            )
        );

        await faunaClient.query(
            Create(
                Collection('Prices'),
                {
                    data: {
                        product: Ref(Collection('Products'), result.ref.id),
                        price,
                        date: getDateAndTime()
                    }
                }
            )
        )

        res.send(200, {
            productId: result.ref.id
        });
    } catch (error) {
        const faunaError = getFaunaError(error);
        res.send(faunaError.status, faunaError);
    }
});

// Sending an HTTP GET req to this endpoint retrieves the document
// from the "Products" collection with the ID specified in the URL.
//
// Expected res:
// {
//     "id": <string>,
//     "url": <string>,
//     "name": <string>,
//     "pictureUrl": <string>,
//     "merchant": <string>,
//     "price": [
//         {
//             'price': <number>,
//             'datetime': <string>,
//         },
//         {
//             'price': <number>,
//             'datetime': <string>,
//         }, ...
//     ]
// }
router.add('GET', '/products/:id', async (req, res) => {
    try {
        const result = await faunaClient.query(
            Get(
                Ref(
                    Collection('Products'),
                    req.params.id
                )
            )
        );

        const pricesResult = await faunaClient.query(
            Paginate(
                Match(
                    Index('price_by_product'),
                    Select('ref', Get(Ref(Collection('Products'), req.params.id)))
                )
            )
        );

        result['data']['prices'] = pricesResult['data'];
        res.send(200, result)
    } catch (error) {
        const faunaError = getFaunaError(error);
        res.send(faunaError.status, faunaError);
    }
})

// Sending an HTTP GET req to this endpoint checks whether the
// product is available in database with the URL specified in the URL.
// Return the product detail by calling the getProductById function if available,
//
// Expected res:
// {
//     "id": <string>,
//     "url": <string>,
//     "name": <string>,
//     "pictureUrl": <string>,
//     "merchant": <string>,
//     "price": [
//         {
//             'price': <number>,
//             'datetime': <string>,
//         },
//         {
//             'price': <number>,
//             'datetime': <string>,
//         }, ...
//     ]
router.add('GET', '/products/search/:url', async (req, res) => {
    try {
        const decodedUrl = decodeURIComponent(req.params.url);
        const result = await faunaClient.query(
            Get(
                Match(Index('product_search_by_url'), decodedUrl)
            )
        );

        const pricesResult = await faunaClient.query(
            Paginate(
                Match(
                    Index('price_by_product'),
                    Select('ref', Get(Ref(Collection('Products'), result.ref.id)))
                )
            )
        );

        result['data']['prices'] = pricesResult['data'];
        res.send(200, result)
    } catch (error) {
        const faunaError = getFaunaError(error);
        res.send(faunaError.status, faunaError);
    }
});

listen(router.run);
