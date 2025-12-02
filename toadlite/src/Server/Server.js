const express = require('express');
const cors = require('cors');
const oracledb = require('oracledb');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Configuration Oracle
const dbConfig = {
    // pour connaitre si la base est XE ou autre exectuer sur le server la ligne de commande suivante:
    //SELECT instance_name, host_name, version FROM v$instance;
    connectString:'10.200.222.123:1521/ORCL_PRI'
    // connectString: '192.168.88.110:1521/XE'
};

// Schémas de base de données
const SCHEMAS = {
    COMPTABILITE: {
        user: 'comptabilite',
        password: 'comptabilite123'
    },
    VENTES: {
        user: 'ventes',
        password: 'ventes123'
    }
};

// Test de connexion
app.post('/api/test-connection', async (req, res) => {
    const { schema } = req.body;

    if (!SCHEMAS[schema]) {
        return res.status(400).json({
            success: false,
            message: `Schéma ${schema} non configuré`
        });
    }

    let connection;
    try {
        const config = { ...SCHEMAS[schema], ...dbConfig };
        connection = await oracledb.getConnection(config);

        res.json({
            success: true,
            message: `Connexion réussie au schéma ${schema}`
        });
    } catch (error) {
        console.error('Erreur de connexion:', error);
        res.status(500).json({
            success: false,
            message: `Erreur de connexion: ${error.message}`
        });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (error) {
                console.error('Erreur fermeture connexion:', error);
            }
        }
    }
});

// Obtenir les métadonnées des tables
app.get('/api/tables/:schema', async (req, res) => {
    const { schema } = req.params;

    if (!SCHEMAS[schema]) {
        return res.status(400).json({ error: `Schéma ${schema} non configuré` });
    }

    let connection;
    try {
        const config = { ...SCHEMAS[schema], ...dbConfig };
        connection = await oracledb.getConnection(config);

        // Récupérer toutes les tables de l'utilisateur
        const tablesResult = await connection.execute(`
      SELECT table_name 
      FROM user_tables 
      ORDER BY table_name
    `);

        const tables = {};

        for (const table of tablesResult.rows) {
            const tableName = table[0];

            // Récupérer les colonnes de la table
            const columnsResult = await connection.execute(`
        SELECT 
          column_name,
          data_type,
          nullable
        FROM user_tab_columns 
        WHERE table_name = :tableName 
        ORDER BY column_id
      `, { tableName });

            tables[tableName] = {
                name: tableName,
                description: `Table ${tableName}`,
                fields: columnsResult.rows.map(col => ({
                    name: col[0],
                    type: mapOracleType(col[1]),
                    label: formatColumnLabel(col[0])
                }))
            };
        }

        res.json(tables);
    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (error) {
                console.error('Erreur fermeture:', error);
            }
        }
    }
});

// Exécuter une requête avec calculs
app.post('/api/execute-query', async (req, res) => {
    const { schema, table, columns, filters, sorting, aggregates, limit = 1000 } = req.body;

    if (!SCHEMAS[schema]) {
        return res.status(400).json({
            success: false,
            error: `Schéma ${schema} non configuré`
        });
    }

    let connection;
    try {
        const config = { ...SCHEMAS[schema], ...dbConfig };
        connection = await oracledb.getConnection(config);

        // Construire la liste des colonnes SELECT
        let selectItems = [];

        // 1. Ajouter les colonnes normales (si sélectionnées)
        if (columns && columns.length > 0) {
            selectItems.push(...columns.map(col => `"${col}"`));
        }

        // 2. Ajouter les calculs (agrégats)
        if (aggregates && aggregates.length > 0) {
            aggregates.forEach((agg) => {
                if (agg.type === 'COUNT') {
                    if (agg.columns && agg.columns.length > 0) {
                        // COUNT sur une colonne spécifique
                        selectItems.push(`COUNT("${agg.columns[0]}") AS "${agg.alias || 'count_' + agg.columns[0]}"`);
                    } else {
                        // COUNT(*) - compter tous les enregistrements
                        selectItems.push(`COUNT(*) AS "${agg.alias || 'total_count'}"`);
                    }
                } else if (agg.type === 'SUM') {
                    if (agg.columns && agg.columns.length > 0) {
                        // SUM sur une colonne
                        selectItems.push(`SUM("${agg.columns[0]}") AS "${agg.alias || 'sum_' + agg.columns[0]}"`);
                    }
                } else if (agg.type === 'AVG') {
                    if (agg.columns && agg.columns.length > 0) {
                        // AVG sur une colonne
                        selectItems.push(`AVG("${agg.columns[0]}") AS "${agg.alias || 'avg_' + agg.columns[0]}"`);
                    }
                }
            });
        }

        // Si aucune colonne ni calcul n'est sélectionné, prendre toutes les colonnes
        const selectClause = selectItems.length > 0 ?
            selectItems.join(', ') : '*';

        let sql = `SELECT ${selectClause} FROM "${table}"`;
        const bindParams = {};

        // Ajouter les filtres WHERE
        if (filters && filters.length > 0) {
            const whereConditions = [];

            filters.forEach((filter, index) => {
                if (!filter.field || !filter.operator) return;

                let condition;
                const paramName = `val${index}`;

                switch (filter.operator) {
                    case '=':
                    case '!=':
                    case '>':
                    case '<':
                    case '>=':
                    case '<=':
                        condition = `"${filter.field}" ${filter.operator} :${paramName}`;
                        bindParams[paramName] = convertValue(filter.value);
                        break;
                    case 'contient':
                        condition = `UPPER("${filter.field}") LIKE UPPER(:${paramName})`;
                        bindParams[paramName] = `%${filter.value}%`;
                        break;
                    default:
                        return;
                }

                whereConditions.push(condition);
            });

            if (whereConditions.length > 0) {
                sql += ` WHERE ${whereConditions.join(' AND ')}`;
            }
        }

        // Ajouter GROUP BY si on a à la fois des colonnes normales ET des calculs
        // (comme en SQL : SELECT colonne, SUM(valeur) FROM table GROUP BY colonne)
        if (columns && columns.length > 0 && aggregates && aggregates.length > 0) {
            const groupByColumns = columns.map(col => `"${col}"`);
            sql += ` GROUP BY ${groupByColumns.join(', ')}`;
        }

        // Ajouter ORDER BY
        if (sorting && sorting.length > 0) {
            const orderByClauses = sorting.map(sort => {
                // Vérifier si le tri s'applique sur une colonne de calcul
                const isAggregateColumn = aggregates?.some(agg =>
                    agg.alias === sort.field ||
                    sort.field.startsWith(agg.type.toLowerCase()) ||
                    sort.field.includes('sum_') ||
                    sort.field.includes('avg_') ||
                    sort.field.includes('count_')
                );

                // Pour les calculs, on utilise déjà l'alias dans le SELECT
                return `"${sort.field}" ${sort.direction}`;
            });
            sql += ` ORDER BY ${orderByClauses.join(', ')}`;
        }

        // Ajouter LIMIT (ROWNUM pour Oracle)
        if (limit) {
            sql = `SELECT * FROM (${sql}) WHERE ROWNUM <= :limit`;
            bindParams.limit = limit;
        }

        console.log('Requête SQL complète:', sql);
        console.log('Paramètres:', bindParams);

        const result = await connection.execute(sql, bindParams, {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
            maxRows: limit || 1000
        });

        res.json({
            success: true,
            data: result.rows,
            metaData: result.metaData,
            count: result.rows.length
        });

    } catch (error) {
        console.error('Erreur requête:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (error) {
                console.error('Erreur fermeture:', error);
            }
        }
    }
});

// Obtenir des données d'exemple
app.get('/api/sample-data/:schema/:table', async (req, res) => {
    const { schema, table } = req.params;

    if (!SCHEMAS[schema]) {
        return res.status(400).json({ error: `Schéma ${schema} non configuré` });
    }

    let connection;
    try {
        const config = { ...SCHEMAS[schema], ...dbConfig };
        connection = await oracledb.getConnection(config);

        const result = await connection.execute(
            `SELECT * FROM "${table}" WHERE ROWNUM <= 5`,
            {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (error) {
                console.error('Erreur fermeture:', error);
            }
        }
    }
});

// Vérifier le type d'une colonne
app.get('/api/column-info/:schema/:table/:column', async (req, res) => {
    const { schema, table, column } = req.params;

    if (!SCHEMAS[schema]) {
        return res.status(400).json({ error: `Schéma ${schema} non configuré` });
    }

    let connection;
    try {
        const config = { ...SCHEMAS[schema], ...dbConfig };
        connection = await oracledb.getConnection(config);

        const result = await connection.execute(`
            SELECT data_type 
            FROM user_tab_columns 
            WHERE table_name = :tableName 
            AND column_name = :columnName
        `, { tableName: table, columnName: column });

        if (result.rows.length > 0) {
            const dataType = result.rows[0][0];
            const isNumeric = ['NUMBER', 'FLOAT', 'INTEGER', 'DECIMAL'].includes(dataType);

            res.json({
                dataType: dataType,
                isNumeric: isNumeric,
                mappedType: mapOracleType(dataType)
            });
        } else {
            res.status(404).json({ error: 'Colonne non trouvée' });
        }
    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (error) {
                console.error('Erreur fermeture:', error);
            }
        }
    }
});

// Fonctions utilitaires
function mapOracleType(oracleType) {
    const typeMap = {
        'NUMBER': 'number',
        'FLOAT': 'number',
        'INTEGER': 'number',
        'DECIMAL': 'number',
        'VARCHAR2': 'text',
        'CHAR': 'text',
        'DATE': 'date',
        'TIMESTAMP': 'date',
        'CLOB': 'text',
        'BLOB': 'binary'
    };
    return typeMap[oracleType] || 'text';
}

function formatColumnLabel(columnName) {
    return columnName
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

function convertValue(value) {
    // Essayer de convertir en nombre
    if (!isNaN(value) && value.trim() !== '') {
        return Number(value);
    }

    // Vérifier si c'est une date
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
        return date;
    }

    return value;
}

// Route de santé
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Serveur Oracle Query Assistant en fonctionnement',
        timestamp: new Date().toISOString()
    });
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`🚀 Serveur backend démarré sur le port ${PORT}`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log('📊 Endpoints disponibles:');
    console.log('   GET  /api/health');
    console.log('   POST /api/test-connection');
    console.log('   GET  /api/tables/:schema');
    console.log('   POST /api/execute-query');
    console.log('   GET  /api/sample-data/:schema/:table');
    console.log('   GET  /api/column-info/:schema/:table/:column');
});

// Gestion propre de la fermeture
process.on('SIGINT', async () => {
    console.log('\n🛑 Fermeture du serveur...');
    process.exit(0);
});