const express = require('express');
const app = express();
const cors = require('cors');
const bodyParser = require('body-parser');
const port = 8080;
const db = require('./db').getBuilder();
const dateStringHelper = require('./dateStringHelper');

app.use(cors());
app.use(bodyParser.json());

app.get('/api/products', async (req, res) => {
    let today = dateStringHelper.today();

    let products = await db('products as p')
                            .select('p.*', db.raw('COALESCE(SUM(s.mutation), 0) as total_stock'))
                            .leftJoin(
                                db.raw(`stock as s ON s.product_id = p.product_id AND '${today}' >= COALESCE(s.date_start, '0000-00-00') AND '${today}' < COALESCE(s.date_end, '9999-99-99')`))
                            .groupBy('p.product_id');

    res.json({ products });
});

app.post('/api/product/add', async (req, res) => {
    await db('products').insert({ name: "Nieuw", label: "Nieuw" });

    res.sendStatus(200);
});

app.post('/api/product/update_name', async (req, res) => {
    let name = req.body.name;
    let product_id = req.body.product_id;

    await db('products').update({ name }).where({ product_id });

    res.sendStatus(200);
});

app.post('/api/product/update_label', async (req, res) => {
    let label = req.body.label;
    let product_id = req.body.product_id;

    await db('products').update({ label }).where({ product_id });

    res.sendStatus(200);
});

app.get('/api/agreement', async (req, res) => {
    let agreements = await db.select('*').from('agreements');
    res.json({ agreements });
});

app.post('/api/agreement/add', async (req, res) => {
    await db('agreements').insert({ description: "Geen naam", deposit: 0, client_id: 1, admin_id: 1 });

    res.sendStatus(200);
});

app.post('/api/agreement/update_deposit', async (req, res) => {
    let deposit = req.body.deposit;
    let agreement_id = req.body.agreement_id;

    await db('agreements').update({ deposit }).where({ agreement_id });

    res.sendStatus(200);
});

app.post('/api/agreement/update_description', async (req, res) => {
    let description = req.body.description;
    let agreement_id = req.body.agreement_id;

    await db('agreements').update({ description }).where({ agreement_id });

    res.sendStatus(200);
});

app.get('/api/agreement/products/:agreement_id', async (req, res) => {
    let agreement_id = req.params.agreement_id;

    let agreement_products = await
        db('stock as s')
            .join('agreements as a', 's.agreement_id', 'a.agreement_id')
            .leftJoin('products as p', 'p.product_id', 's.product_id')
            .select(db.raw('s.stock_id, p.name, s.mutation * -1 as amount, DATE_FORMAT(s.date_start, "%Y-%m-%d") AS date_start, DATE_FORMAT(s.date_end, "%Y-%m-%d") AS date_end'))
            .where('a.agreement_id', agreement_id);

    res.json({ agreement_products });
});

app.post('/api/agreement/add_product', async (req, res) => {
    let agreement_id = req.body.agreement_id;
    let product_id = req.body.product_id;

    await db('stock').insert({ agreement_id, product_id, mutation: -1, date_start: new Date().toISOString().split('T')[0], date_end: new Date().toISOString().split('T')[0] });

    res.sendStatus(200);
});

app.get('/api/stock/total', async (req, res) => {
    let today = dateStringHelper.today();

    let todayMinusDays = dateStringHelper.today(-90);

    let stockData = await db.raw(`WITH RECURSIVE dates AS (
                                    SELECT '${todayMinusDays}' AS _day_ 
                                    UNION ALL 
                                    SELECT DATE_ADD(_day_, INTERVAL 1 DAY) 
                                    FROM dates 
                                    WHERE _day_ < '${today}'
                                ) 
                                
                                SELECT DATE_FORMAT(d._day_, "%Y-%m-%d") AS stock_date, 
                                (SELECT COALESCE(SUM(s.mutation), 0) FROM stock AS s WHERE d._day_ >= COALESCE(s.date_start, '0000-00-00') AND d._day_ < COALESCE(s.date_end, '9999-99-99')) AS total_stock 
                                FROM dates AS d`);

    //Raw KNEX query, the first index is the result of the query
    stockData = stockData[0];

    res.json({ stockData })
});

app.post('/api/stock/add_mutation', async (req, res) => {
    let product_id = req.body.product_id;
    let mutation = req.body.mutation;

    await db('stock').insert({ product_id, mutation });

    res.sendStatus(200);
});

app.post('/api/agreement/product/update_date_start', async (req, res) => {
    let stock_id = req.body.stock_id;
    let date_start = req.body.date_start;

    await db('stock').update({ date_start }).where({ stock_id });

    res.sendStatus(200);
});

app.post('/api/agreement/product/update_date_end', async (req, res) => {
    let stock_id = req.body.stock_id;
    let date_end = req.body.date_end;

    await db('stock').update({ date_end }).where({ stock_id });

    res.sendStatus(200);
});

app.post('/api/agreement/product/delete', async (req, res) => {
    let stock_id = req.body.stock_id;

    await db('stock').where({ stock_id }).del();

    res.sendStatus(200);
});

app.post('/api/agreement/product/update_amount', async (req, res) => {
    let stock_id = req.body.stock_id;
    let amount = req.body.amount;

    await db('stock').update({ mutation: db.raw(amount * -1) }).where({ stock_id });

    res.sendStatus(200);
});

app.post('/api/agreement/delete', async (req, res) => {
    let agreement_id = req.body.agreement_id; 

    //Delete all the linked products to this agreement
    await db('stock').where({agreement_id}).del();

    //Delete the agreement
    await db('agreements').where({agreement_id}).del();

    res.sendStatus(200);
});

app.post('/api/product/delete', async (req, res) => {
    let product_id = req.body.product_id;

    await db('products').where({product_id}).del();

    res.sendStatus(200);
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});