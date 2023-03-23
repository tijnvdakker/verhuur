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
        .select('p.*', db.raw('COALESCE(pg.color, "#cccccc") as color'), db.raw('COALESCE(SUM(s.mutation), 0) as current_stock'), db.raw('(SELECT COALESCE(SUM(ss.mutation), 0) FROM stock as ss WHERE ss.product_id = p.product_id AND ss.agreement_id IS NULL) as total_stock'))
        .leftJoin('product_groups as pg', 'p.product_group_id', 'pg.product_group_id')
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

app.post('/api/product/update_price', async (req, res) => {
    let price = req.body.price;
    let product_id = req.body.product_id;

    await db('products').update({ price }).where({ product_id });

    res.sendStatus(200);
});

app.post('/api/product/update_linked_product_group', async (req, res) => {
    let product_group_id = req.body.product_group_id;
    let product_id = req.body.product_id;

    if (product_group_id == 0) {
        product_group_id = null;
    }

    await db('products').update({ product_group_id }).where({ product_id });

    res.sendStatus(200);
});

app.get('/api/product/groups', async (req, res) => {
    let productGroups = await db('product_groups').select('*');

    res.json({productGroups})
});

app.post('/api/product/group/add', async (req, res) => {
    await db('product_groups').insert({ name: "Nieuw" });

    res.sendStatus(200);
});

app.post('/api/product/group/update_name', async (req, res) => {
    let name = req.body.name;
    let product_group_id = req.body.product_group_id;

    await db('product_groups').update({ name }).where({ product_group_id });

    res.sendStatus(200);
});

app.post('/api/product/group/update_color', async (req, res) => {
    let color = req.body.color;
    let product_group_id = req.body.product_group_id;

    await db('product_groups').update({ color }).where({ product_group_id });

    res.sendStatus(200);
});

app.get('/api/agreement/:client_id/:product_id', async (req, res) => {
    let client_id = req.params.client_id;
    let product_id = req.params.product_id;

    if (client_id == 0) {
        client_id = "%%";
    }

    if (product_id == 0) {
        product_id = "%%";
    }

    let agreements = await db.select('a.*', 'c.name as client', db.raw('SUM(s.mutation * -1 * p.price) as price'), db.raw("GROUP_CONCAT(CONCAT('stock_id:', s.stock_id, '|', 'name:', p.name, '|', 'amount:', s.mutation * -1, '|', 'price:', p.price, '|', 'subtotal:', p.price * s.mutation * -1, '|', 'date_start:', DATE_FORMAT(s.date_start, '%Y-%m-%d'), '|', 'date_end:', DATE_FORMAT(s.date_end, '%Y-%m-%d'))) AS agreement_products"))
        .from('agreements as a')
        .leftJoin('stock as s', 's.agreement_id', 'a.agreement_id')
        .leftJoin('products as p', 'p.product_id', 's.product_id')
        .leftJoin('clients as c', 'c.client_id', 'a.client_id')
        .groupBy('a.agreement_id')
        .orderBy('a.description', 'p.name')
        .where(db.raw(`c.client_id LIKE '${client_id}'`))
        .where(db.raw(`p.product_id LIKE '${product_id}'`));

    res.json({ agreements });
});

app.post('/api/agreement/add', async (req, res) => {
    await db('agreements').insert({ description: "Geen naam", deposit: 0 });

    res.sendStatus(200);
});

app.post('/api/agreement/link_client', async (req, res) => {
    let client_id = req.body.client_id;
    let agreement_id = req.body.agreement_id;

    if (client_id == 0) {
        client_id = null;
    }

    await db('agreements').update({client_id}).where({agreement_id});

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

app.post('/api/agreement/add_product', async (req, res) => {
    let agreement_id = req.body.agreement_id;
    let product_id = req.body.product_id;

    if (product_id == 0) {
        return res.status(400).send("Kies een product om toe te voegen!");
    }

    await db('stock').insert({ agreement_id, product_id, mutation: -1, date_start: dateStringHelper.today(), date_end: dateStringHelper.today(1) });

    res.sendStatus(200);
});

app.get('/api/stock/total/:product_group_id/:product_id', async (req, res) => {
    let today = dateStringHelper.today();

    let todayMinusDays = dateStringHelper.today(-90);

    let product_group_id = req.params.product_group_id;
    let product_id = req.params.product_id;

    console.log(product_group_id, product_id);

    //Geen filter applyen
    if (product_group_id == 0) {
        product_group_id = "%%";
    }

    if (product_id == 0) {
        product_id = "%%";
    }

    console.log(product_id, product_group_id);

    let stockData = await db.raw(`WITH RECURSIVE dates AS (
                                    SELECT '${todayMinusDays}' AS _day_ 
                                    UNION ALL 
                                    SELECT DATE_ADD(_day_, INTERVAL 1 DAY) 
                                    FROM dates 
                                    WHERE _day_ < '${today}'
                                ) 
                                
                                SELECT DATE_FORMAT(d._day_, "%Y-%m-%d") AS stock_date, 
                                (SELECT COALESCE(SUM(s.mutation), 0) FROM stock AS s JOIN products as p ON s.product_id = p.product_id WHERE d._day_ >= COALESCE(s.date_start, '0000-00-00') AND d._day_ < COALESCE(s.date_end, '9999-99-99') AND p.product_group_id LIKE '${product_group_id}' AND p.product_id LIKE '${product_id}') AS total_stock 
                                FROM dates AS d`);

    //Raw KNEX query, the first index is the result of the query
    stockData = stockData[0];

    res.json({ stockData })
});

app.post('/api/stock/add_mutation', async (req, res) => {
    let product_id = req.body.product_id;
    let mutation = req.body.mutation;
    let description = req.body.description;

    await db('stock').insert({ product_id, mutation, description: description });

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

    let today = dateStringHelper.today();

    let result = await db.raw(`SELECT SUM(s.mutation) AS current_stock FROM stock as ss LEFT JOIN stock as s ON s.product_id = ss.product_id AND s.stock_id <> ss.stock_id AND '${today}' >= COALESCE(s.date_start, '0000-00-00') AND '${today}' < COALESCE(s.date_end, '9999-99-99') WHERE ss.stock_id = ${stock_id} `);

    //Raw KNEX query, the first index is the result of the query
    result = result[0][0];

    if (amount > result.current_stock) {
        return res.status(400).send("Er is op dit moment niet genoeg voorraad om dit aantal producten te bestellen!");
    }

    await db('stock').update({ mutation: db.raw(amount * -1) }).where({ stock_id });

    res.sendStatus(200);
});

app.post('/api/agreement/delete', async (req, res) => {
    let agreement_id = req.body.agreement_id;

    //Delete all the linked products to this agreement
    await db('stock').where({ agreement_id }).del();

    //Delete the agreement
    await db('agreements').where({ agreement_id }).del();

    res.sendStatus(200);
});

app.post('/api/product/delete', async (req, res) => {
    let product_id = req.body.product_id;

    await db('products').where({ product_id }).del();

    res.sendStatus(200);
});

app.post('/api/product/group/delete', async (req, res) => {
    let product_group_id = req.body.product_group_id;

    await db('product_groups').where({ product_group_id }).del();

    res.sendStatus(200);
});

app.get('/api/stock/history/:product_id', async (req, res) => {
    let product_id = req.params.product_id;

    let history = await db('stock as s').select('s.*', db.raw('COALESCE(s.description, a.description, "Geen omschrijving") as description')).leftJoin('agreements as a', 'a.agreement_id', 's.agreement_id').where('product_id', product_id);

    res.json({history});
});

app.get('/api/clients', async (req, res) => {
   
    let clients = await db('clients').select('*');

    res.json({ clients });
});

app.post('/api/client/add', async (req, res) => {
    await db('clients').insert({ name: "Nieuw", email: "test@test.nl", phone: "0612345678", address: "Teststraat 1" });

    res.sendStatus(200);
});

app.post('/api/client/update_name', async (req, res) => {
    let name = req.body.name;
    let client_id = req.body.client_id;

    await db('clients').update({ name }).where({ client_id });

    res.sendStatus(200);
});

app.post('/api/client/update_email', async (req, res) => {
    let email = req.body.email;
    let client_id = req.body.client_id;

    await db('clients').update({ email }).where({ client_id });

    res.sendStatus(200);
});

app.post('/api/client/update_phone', async (req, res) => {
    let phone = req.body.phone;
    let client_id = req.body.client_id;

    await db('clients').update({ phone }).where({ client_id });

    res.sendStatus(200);
});

app.post('/api/client/update_address', async (req, res) => {
    let address = req.body.address;
    let client_id = req.body.client_id;

    await db('clients').update({ address }).where({ client_id });

    res.sendStatus(200);
});

app.post('/api/client/delete', async (req, res) => {
    let client_id = req.body.client_id;

    await db('clients').where({ client_id }).del();

    res.sendStatus(200);
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});