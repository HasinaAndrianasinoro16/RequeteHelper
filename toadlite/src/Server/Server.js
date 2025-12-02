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
    connectString:'10.200.222.123:1521/ORCL_PRI'
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

// Exécuter une requête avec calculs par ligne
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
        } else {
            // Si aucune colonne n'est sélectionnée, prendre toutes les colonnes
            const allColumns = await connection.execute(
                `SELECT column_name FROM user_tab_columns WHERE table_name = :tableName ORDER BY column_id`,
                { tableName: table }
            );
            selectItems.push(...allColumns.rows.map(row => `"${row[0]}"`));
        }

        // Construire la requête de base
        let sql = `SELECT ${selectItems.join(', ')} FROM "${table}"`;
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

        // Ajouter ORDER BY
        if (sorting && sorting.length > 0) {
            const orderByClauses = sorting.map(sort => {
                return `"${sort.field}" ${sort.direction}`;
            });
            sql += ` ORDER BY ${orderByClauses.join(', ')}`;
        }

        // Ajouter LIMIT (ROWNUM pour Oracle)
        if (limit) {
            sql = `SELECT * FROM (${sql}) WHERE ROWNUM <= :limit`;
            bindParams.limit = limit;
        }

        console.log('Requête SQL de base:', sql);
        console.log('Paramètres:', bindParams);

        // Exécuter la requête
        const result = await connection.execute(sql, bindParams, {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
            maxRows: limit || 1000
        });

        // Appliquer les calculs par LIGNE côté serveur
        let finalResults = result.rows;

        if (aggregates && aggregates.length > 0) {
            finalResults = result.rows.map(row => {
                const newRow = { ...row };

                aggregates.forEach(agg => {
                    if (agg.type === 'SUM') {
                        // Calculer la somme des colonnes sélectionnées pour chaque ligne
                        let sum = 0;
                        let hasValidValues = false;

                        agg.columns.forEach(col => {
                            const value = row[col];
                            if (value !== null && value !== undefined && !isNaN(value)) {
                                sum += parseFloat(value);
                                hasValidValues = true;
                            }
                        });

                        newRow[agg.alias || `sum_${agg.columns.join('_')}`] = hasValidValues ? sum : null;
                    }
                    else if (agg.type === 'AVG') {
                        // Calculer la moyenne des colonnes sélectionnées pour chaque ligne
                        let sum = 0;
                        let count = 0;

                        agg.columns.forEach(col => {
                            const value = row[col];
                            if (value !== null && value !== undefined && !isNaN(value)) {
                                sum += parseFloat(value);
                                count++;
                            }
                        });

                        const avg = count > 0 ? sum / count : null;
                        newRow[agg.alias || `avg_${agg.columns.join('_')}`] = avg;
                    }
                    else if (agg.type === 'COUNT') {
                        // Compter le nombre de colonnes non-nulles pour chaque ligne
                        let count = 0;

                        if (agg.columns.length === 0) {
                            // COUNT(*) - compter toutes les colonnes non-nulles
                            Object.keys(row).forEach(key => {
                                if (row[key] !== null && row[key] !== undefined) {
                                    count++;
                                }
                            });
                        } else {
                            agg.columns.forEach(col => {
                                if (row[col] !== null && row[col] !== undefined) {
                                    count++;
                                }
                            });
                        }

                        newRow[agg.alias || `count_${agg.columns.join('_') || 'all'}`] = count;
                    }
                });

                return newRow;
            });
        }

        // Générer les métadonnées
        const metaData = result.metaData ? [...result.metaData] : [];

        // Ajouter les métadonnées pour les nouvelles colonnes calculées
        if (aggregates && aggregates.length > 0) {
            aggregates.forEach(agg => {
                const alias = agg.alias ||
                    (agg.type === 'SUM' ? `sum_${agg.columns.join('_')}` :
                        agg.type === 'AVG' ? `avg_${agg.columns.join('_')}` :
                            `count_${agg.columns.join('_') || 'all'}`);

                metaData.push({
                    name: alias,
                    dbType: agg.type === 'AVG' ? 'NUMBER' : 'NUMBER',
                    precision: agg.type === 'AVG' ? 10 : 10,
                    scale: agg.type === 'AVG' ? 2 : 0
                });
            });
        }

        res.json({
            success: true,
            data: finalResults,
            metaData: metaData,
            count: finalResults.length
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
});

// Gestion propre de la fermeture
process.on('SIGINT', async () => {
    console.log('\n🛑 Fermeture du serveur...');
    process.exit(0);
});