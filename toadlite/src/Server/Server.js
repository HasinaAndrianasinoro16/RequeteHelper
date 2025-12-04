const express = require('express');
const cors = require('cors');
const oracledb = require('oracledb');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Configuration Oracle (sans credentials par défaut)
const dbConfig = {
    connectString:'10.200.222.123:1521/ORCL_PRI'
};

// Test de connexion avec credentials dynamiques
app.post('/api/test-connection', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: 'Nom d\'utilisateur et mot de passe requis'
        });
    }

    let connection;
    try {
        const config = {
            user: username,
            password: password,
            connectString: dbConfig.connectString
        };

        connection = await oracledb.getConnection(config);

        // Test supplémentaire: obtenir le nom de l'utilisateur courant
        const userResult = await connection.execute(
            `SELECT USER FROM DUAL`,
            {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({
            success: true,
            message: `Connexion réussie à ${userResult.rows[0].USER}`,
            username: userResult.rows[0].USER
        });
    } catch (error) {
        console.error('Erreur de connexion:', error);

        let errorMessage = 'Erreur de connexion';
        if (error.errorNum === 1017) {
            errorMessage = 'Identifiants incorrects';
        } else if (error.errorNum === 12541) {
            errorMessage = 'Serveur Oracle inaccessible';
        } else if (error.errorNum === 12154) {
            errorMessage = 'Service Oracle introuvable';
        } else {
            errorMessage = error.message;
        }

        res.status(500).json({
            success: false,
            message: errorMessage
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

// Obtenir les métadonnées des tables avec credentials dynamiques
app.post('/api/tables', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis' });
    }

    let connection;
    try {
        const config = {
            user: username,
            password: password,
            connectString: dbConfig.connectString
        };

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
                    nullable,
                    data_length,
                    data_precision,
                    data_scale
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
                    label: formatColumnLabel(col[0]),
                    nullable: col[2] === 'Y',
                    length: col[3],
                    precision: col[4],
                    scale: col[5]
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

// Exécuter une requête avec calculs par ligne ET pagination
app.post('/api/execute-query', async (req, res) => {
    const { username, password, table, columns, filters, sorting, aggregates, page = 1, pageSize = 50 } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            error: 'Nom d\'utilisateur et mot de passe requis'
        });
    }

    if (!table) {
        return res.status(400).json({
            success: false,
            error: 'Nom de table requis'
        });
    }

    let connection;
    try {
        const config = {
            user: username,
            password: password,
            connectString: dbConfig.connectString
        };

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
                    case 'commence par':
                        condition = `UPPER("${filter.field}") LIKE UPPER(:${paramName})`;
                        bindParams[paramName] = `${filter.value}%`;
                        break;
                    case 'termine par':
                        condition = `UPPER("${filter.field}") LIKE UPPER(:${paramName})`;
                        bindParams[paramName] = `%${filter.value}`;
                        break;
                    case 'est null':
                        condition = `"${filter.field}" IS NULL`;
                        break;
                    case 'n\'est pas null':
                        condition = `"${filter.field}" IS NOT NULL`;
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

        // EXÉCUTER LA REQUÊTE POUR LE TOTAL (sans LIMIT)
        console.log('Requête SQL pour total:', sql);

        // Compter le nombre total de résultats
        const countResult = await connection.execute(
            `SELECT COUNT(*) as total_count FROM (${sql})`,
            bindParams,
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const totalCount = countResult.rows[0]?.TOTAL_COUNT || 0;
        const totalPages = Math.ceil(totalCount / pageSize);
        const offset = (page - 1) * pageSize;

        // Ajouter la pagination (Oracle 12c+ syntax)
        let paginatedSql = sql;
        if (pageSize > 0) {
            paginatedSql = `
                SELECT * FROM (
                    SELECT t.*, ROWNUM rnum FROM (
                        ${sql}
                    ) t WHERE ROWNUM <= :maxRow
                ) WHERE rnum > :minRow
            `;

            bindParams.maxRow = page * pageSize;
            bindParams.minRow = offset;
        }

        console.log('Requête SQL paginée:', paginatedSql);
        console.log('Paramètres pagination:', { page, pageSize, offset, totalCount });

        // Exécuter la requête paginée
        const result = await connection.execute(paginatedSql, bindParams, {
            outFormat: oracledb.OUT_FORMAT_OBJECT
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
            pagination: {
                currentPage: parseInt(page),
                pageSize: parseInt(pageSize),
                totalCount: parseInt(totalCount),
                totalPages: parseInt(totalPages),
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            },
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

// Obtenir des données d'exemple avec credentials dynamiques
app.post('/api/sample-data', async (req, res) => {
    const { username, password, table } = req.body;

    if (!username || !password || !table) {
        return res.status(400).json({
            error: 'Nom d\'utilisateur, mot de passe et nom de table requis'
        });
    }

    let connection;
    try {
        const config = {
            user: username,
            password: password,
            connectString: dbConfig.connectString
        };

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

// Route pour obtenir des informations sur l'utilisateur/schéma
app.post('/api/user-info', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            error: 'Nom d\'utilisateur et mot de passe requis'
        });
    }

    let connection;
    try {
        const config = {
            user: username,
            password: password,
            connectString: dbConfig.connectString
        };

        connection = await oracledb.getConnection(config);

        // Obtenir des informations sur l'utilisateur
        const userInfo = await connection.execute(`
            SELECT 
                USER as username,
                (SELECT default_tablespace FROM user_users) as default_tablespace,
                (SELECT temporary_tablespace FROM user_users) as temp_tablespace,
                (SELECT created FROM user_users) as created_date,
                SYSDATE as current_date
            FROM DUAL
        `, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        // Obtenir le nombre de tables
        const tableCount = await connection.execute(
            `SELECT COUNT(*) as table_count FROM user_tables`,
            {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({
            success: true,
            userInfo: {
                ...userInfo.rows[0],
                tableCount: tableCount.rows[0].TABLE_COUNT
            }
        });

    } catch (error) {
        console.error('Erreur:', error);
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

// Fonctions utilitaires
function mapOracleType(oracleType) {
    const typeMap = {
        'NUMBER': 'number',
        'FLOAT': 'number',
        'INTEGER': 'number',
        'DECIMAL': 'number',
        'VARCHAR2': 'text',
        'CHAR': 'text',
        'NVARCHAR2': 'text',
        'NCHAR': 'text',
        'DATE': 'date',
        'TIMESTAMP': 'date',
        'TIMESTAMP WITH TIME ZONE': 'date',
        'TIMESTAMP WITH LOCAL TIME ZONE': 'date',
        'CLOB': 'text',
        'BLOB': 'binary',
        'RAW': 'binary',
        'LONG': 'text',
        'LONG RAW': 'binary'
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
    console.log('   POST /api/tables');
    console.log('   POST /api/execute-query');
    console.log('   POST /api/sample-data');
    console.log('   POST /api/user-info');
});

// Gestion propre de la fermeture
process.on('SIGINT', async () => {
    console.log('\n🛑 Fermeture du serveur...');
    process.exit(0);
});