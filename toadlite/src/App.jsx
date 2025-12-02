import React, { useState, useRef } from "react";
import { Dropdown } from "primereact/dropdown";
import { Toast } from "primereact/toast";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Card } from "primereact/card";
import { Dialog } from "primereact/dialog";
import { Checkbox } from "primereact/checkbox";
import { InputText } from "primereact/inputtext";
import { RadioButton } from "primereact/radiobutton";

import "primereact/resources/themes/lara-light-blue/theme.css";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";

export default function App() {
    const toast = useRef();
    const [selectedDb, setSelectedDb] = useState(null);
    const [connected, setConnected] = useState(false);
    const [result, setResult] = useState([]);
    const [columns, setColumns] = useState([]);
    const [loading, setLoading] = useState(false);

    // États pour l'interface visuelle
    const [selectedTable, setSelectedTable] = useState(null);
    const [selectedColumns, setSelectedColumns] = useState([]);
    const [filters, setFilters] = useState([]);
    const [sorting, setSorting] = useState([]);
    const [showTableDialog, setShowTableDialog] = useState(false);
    const [showFilterDialog, setShowFilterDialog] = useState(false);
    const [showSortDialog, setShowSortDialog] = useState(false);
    const [currentFilter, setCurrentFilter] = useState({ field: "", operator: "=", value: "" });
    const [currentSort, setCurrentSort] = useState({ field: "", direction: "ASC" });

    // États pour les filtres avancés (somme, moyenne, compte)
    const [showAggregateDialog, setShowAggregateDialog] = useState(false);
    const [currentAggregate, setCurrentAggregate] = useState({
        type: "",
        columns: [],
        alias: ""
    });
    const [aggregates, setAggregates] = useState([]);

    // États pour la gestion des requêtes sauvegardées
    const [savedQueries, setSavedQueries] = useState([]);
    const [showSaveQueryDialog, setShowSaveQueryDialog] = useState(false);
    const [queryName, setQueryName] = useState("");
    const [showLoadQueryDialog, setShowLoadQueryDialog] = useState(false);

    // URL de base de l'API backend
    const API_BASE_URL = 'http://localhost:5000/api';

    // Structure initiale des bases de données
    const [businessDatabases, setBusinessDatabases] = useState({
        "COMPTABILITE": {
            name: "Base Comptabilité",
            description: "Données financières et comptables",
            tables: {}
        },
        "VENTES": {
            name: "Base Ventes",
            description: "Données commerciales et ventes",
            tables: {}
        }
    });

    const databases = Object.keys(businessDatabases).map(key => ({
        label: businessDatabases[key].name,
        value: key,
        description: businessDatabases[key].description
    }));

    // Fonction utilitaire pour formater les labels des colonnes
    const formatColumnLabel = (columnName) => {
        return columnName
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    };

    // Formater le label d'agrégat
    const formatAggregateLabel = (agg) => {
        const typeMap = {
            'SUM': 'Somme',
            'AVG': 'Moyenne',
            'COUNT': 'Compte'
        };

        if (agg.columns && agg.columns.length > 0) {
            const columnLabels = agg.columns
                .map(col => businessDatabases[selectedDb]?.tables[selectedTable]?.fields
                    ?.find(f => f.name === col)?.label || formatColumnLabel(col))
                .join(', ');

            return `${typeMap[agg.type]} de ${columnLabels}`;
        } else {
            return `${typeMap[agg.type]}`;
        }
    };

    // Générer un nom de requête par défaut
    const generateDefaultQueryName = () => {
        const count = savedQueries.length + 1;
        return `Requête ${count}`;
    };

    // Sauvegarder la requête actuelle
    const saveCurrentQuery = () => {
        if (!selectedTable) {
            toast.current.show({
                severity: 'warn',
                summary: 'Requête incomplète',
                detail: 'Veuillez d\'abord configurer une requête'
            });
            return;
        }

        const defaultName = generateDefaultQueryName();
        setQueryName(defaultName);
        setShowSaveQueryDialog(true);
    };

    // Confirmer la sauvegarde
    const confirmSaveQuery = () => {
        const queryToSave = {
            id: `query_${Date.now()}`,
            name: queryName || generateDefaultQueryName(),
            database: selectedDb,
            table: selectedTable,
            columns: [...selectedColumns],
            filters: [...filters],
            sorting: [...sorting],
            aggregates: [...aggregates],
            createdAt: new Date().toISOString()
        };

        setSavedQueries([...savedQueries, queryToSave]);
        setShowSaveQueryDialog(false);
        setQueryName("");

        toast.current.show({
            severity: 'success',
            summary: 'Requête sauvegardée !',
            detail: `"${queryToSave.name}" a été enregistrée`
        });
    };

    // Charger une requête sauvegardée
    const loadSavedQuery = (query) => {
        setSelectedDb(query.database);
        setSelectedTable(query.table);
        setSelectedColumns([...query.columns]);
        setFilters([...query.filters]);
        setSorting([...query.sorting]);
        setAggregates([...query.aggregates]);
        setShowLoadQueryDialog(false);
        setResult([]);

        toast.current.show({
            severity: 'success',
            summary: 'Requête chargée',
            detail: `"${query.name}" a été chargée`
        });
    };

    // Supprimer une requête sauvegardée
    const deleteSavedQuery = (queryId, event) => {
        event.stopPropagation();
        const queryToDelete = savedQueries.find(q => q.id === queryId);
        setSavedQueries(savedQueries.filter(q => q.id !== queryId));

        toast.current.show({
            severity: 'info',
            summary: 'Requête supprimée',
            detail: `"${queryToDelete.name}" a été supprimée`
        });
    };

    // Connexion à la base de données via l'API
    const handleConnect = async () => {
        if (!selectedDb) return;

        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/test-connection`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ schema: selectedDb })
            });

            const result = await response.json();

            if (result.success) {
                // Charger les métadonnées des tables
                const tablesResponse = await fetch(`${API_BASE_URL}/tables/${selectedDb}`);
                const tablesData = await tablesResponse.json();

                // Mettre à jour la structure avec les vraies tables
                setBusinessDatabases(prev => ({
                    ...prev,
                    [selectedDb]: {
                        ...prev[selectedDb],
                        tables: tablesData
                    }
                }));

                setConnected(true);
                toast.current.show({
                    severity: 'success',
                    summary: 'Connecté',
                    detail: `Base ${businessDatabases[selectedDb].name} ouverte avec ${Object.keys(tablesData).length} tables`
                });
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Erreur de connexion:', error);
            toast.current.show({
                severity: 'error',
                summary: 'Erreur de connexion',
                detail: error.message
            });
        } finally {
            setLoading(false);
        }
    };

    const handleDisconnect = () => {
        setConnected(false);
        setSelectedDb(null);
        setSelectedTable(null);
        setSelectedColumns([]);
        setFilters([]);
        setSorting([]);
        setAggregates([]);
        setResult([]);
    };

    // Sélection de table
    const handleTableSelect = (tableKey) => {
        setSelectedTable(tableKey);
        // Sélectionner toutes les colonnes par défaut
        const tableFields = businessDatabases[selectedDb].tables[tableKey]?.fields || [];
        setSelectedColumns(tableFields.map(f => f.name));
        setShowTableDialog(false);

        toast.current.show({
            severity: 'info',
            summary: 'Table sélectionnée',
            detail: businessDatabases[selectedDb].tables[tableKey]?.name || tableKey
        });
    };

    // Ajout de filtre
    const addFilter = () => {
        if (!currentFilter.field || !currentFilter.value) return;

        const newFilter = {
            id: `filter_${Date.now()}`,
            ...currentFilter,
            label: formatColumnLabel(currentFilter.field)
        };

        setFilters([...filters, newFilter]);
        setCurrentFilter({ field: "", operator: "=", value: "" });
        setShowFilterDialog(false);
    };

    // Ajout de tri
    const addSort = () => {
        if (!currentSort.field) return;

        const newSort = {
            id: `sort_${Date.now()}`,
            ...currentSort,
            label: formatColumnLabel(currentSort.field)
        };

        setSorting([...sorting, newSort]);
        setCurrentSort({ field: "", direction: "ASC" });
        setShowSortDialog(false);
    };

    // Ajouter un agrégat
    const addAggregate = () => {
        if (!currentAggregate.type || (currentAggregate.type !== 'COUNT' && currentAggregate.columns.length === 0)) return;

        const newAggregate = {
            id: `agg_${Date.now()}`,
            type: currentAggregate.type,
            columns: [...currentAggregate.columns],
            alias: currentAggregate.alias ||
                `${currentAggregate.type.toLowerCase()}_${currentAggregate.columns.length > 0 ? currentAggregate.columns.join('_') : 'all'}`,
            label: formatAggregateLabel(currentAggregate)
        };

        setAggregates([...aggregates, newAggregate]);
        setCurrentAggregate({ type: "", columns: [], alias: "" });
        setShowAggregateDialog(false);
    };

    // Suppression de filtre/tri/agrégat
    const removeFilter = (id) => {
        setFilters(filters.filter(f => f.id !== id));
    };

    const removeSort = (id) => {
        setSorting(sorting.filter(s => s.id !== id));
    };

    const removeAggregate = (id) => {
        setAggregates(aggregates.filter(a => a.id !== id));
    };

    // Exécution de la requête visuelle (incluant les calculs)
    const executeVisualQuery = async () => {
        if (!selectedTable) {
            toast.current.show({
                severity: 'warn',
                summary: 'Table manquante',
                detail: 'Veuillez sélectionner une table'
            });
            return;
        }

        setLoading(true);

        try {
            const requestBody = {
                schema: selectedDb,
                table: selectedTable,
                columns: selectedColumns,
                filters: filters,
                sorting: sorting,
                aggregates: aggregates,
                limit: 1000
            };

            const response = await fetch(`${API_BASE_URL}/execute-query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            const result = await response.json();

            if (result.success) {
                setResult(result.data);
                setColumns(result.metaData.map(col => ({
                    field: col.name,
                    header: formatColumnLabel(col.name)
                })));

                // Message adapté selon le type de requête
                let detailMessage = `${result.count} résultat(s) trouvé(s)`;
                if (aggregates.length > 0 && selectedColumns.length > 0) {
                    detailMessage = `${result.count} ligne(s) avec ${aggregates.length} calcul(s) agrégé(s)`;
                } else if (aggregates.length > 0 && selectedColumns.length === 0) {
                    detailMessage = `${aggregates.length} calcul(s) global(aux) effectué(s)`;
                }

                toast.current.show({
                    severity: 'success',
                    summary: 'Requête exécutée',
                    detail: detailMessage
                });
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Erreur lors de l\'exécution:', error);
            toast.current.show({
                severity: 'error',
                summary: 'Erreur d\'exécution',
                detail: error.message
            });
        } finally {
            setLoading(false);
        }
    };

    // Formater une valeur de calcul
    const formatCalculationValue = (value, aggregateType) => {
        if (value === null || value === undefined) return 'N/A';

        if (aggregateType === 'AVG') {
            return Number(value).toFixed(2);
        } else if (aggregateType === 'COUNT' || aggregateType === 'SUM') {
            return Number(value).toLocaleString();
        }
        return value;
    };

    // Vérifier si une colonne est un calcul
    const isCalculationColumn = (columnName) => {
        return aggregates.some(agg =>
            agg.alias === columnName ||
            columnName.startsWith(agg.type.toLowerCase()) ||
            columnName.includes('sum_') ||
            columnName.includes('avg_') ||
            columnName.includes('count_')
        );
    };

    // Réinitialisation
    const resetQuery = () => {
        setSelectedTable(null);
        setSelectedColumns([]);
        setFilters([]);
        setSorting([]);
        setAggregates([]);
        setResult([]);
    };

    // Options pour les colonnes dans les dialogues de filtre et tri
    const getFieldOptions = () => {
        if (!selectedDb || !selectedTable) return [];
        const table = businessDatabases[selectedDb].tables[selectedTable];
        return table?.fields?.map(field => ({
            label: field.label || formatColumnLabel(field.name),
            value: field.name,
            type: field.type
        })) || [];
    };

    return (
        <div className="app-container vh-100 vw-100 bg-light">
            <Toast ref={toast} position="top-right" />

            {/* Header Bootstrap */}
            <header className="bg-white shadow-sm border-bottom">
                <div className="container-fluid">
                    <div className="row align-items-center py-3">
                        <div className="col">
                            <div className="d-flex align-items-center">
                                <i className="pi pi-table fs-1 text-primary me-3"></i>
                                <div>
                                    <h1 className="h3 mb-0 text-dark">Assistant de Requêtes Métier</h1>
                                    <small className="text-muted">Interface 100% visuelle - Connexion Oracle réelle</small>
                                </div>
                            </div>
                        </div>
                        <div className="col-auto">
                            <div className="d-flex gap-2">
                                <button
                                    className="btn btn-outline-primary"
                                    onClick={() => setShowLoadQueryDialog(true)}
                                    disabled={savedQueries.length === 0}
                                >
                                    <i className="pi pi-folder me-2"></i>
                                    Mes requêtes
                                </button>
                                <button
                                    className="btn btn-info text-white"
                                    onClick={saveCurrentQuery}
                                    disabled={!selectedTable}
                                >
                                    <i className="pi pi-save me-2"></i>
                                    Sauvegarder
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="container-fluid p-0">
                {/* Barre de connexion */}
                <div className="bg-light border-bottom">
                    <div className="container-fluid py-3">
                        <div className="row align-items-center">
                            <div className="col-md-8">
                                <div className="d-flex align-items-center gap-3">
                                    <Dropdown
                                        value={selectedDb}
                                        onChange={e => setSelectedDb(e.value)}
                                        options={databases}
                                        placeholder="Choisir une base de données..."
                                        className="w-auto min-w-300"
                                        disabled={connected}
                                    />
                                    {selectedDb && (
                                        <span className="text-muted">
                                            {businessDatabases[selectedDb].description}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="col-md-4 text-end">
                                {!connected ? (
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleConnect}
                                        disabled={!selectedDb || loading}
                                    >
                                        {loading ? (
                                            <>
                                                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                                Connexion...
                                            </>
                                        ) : (
                                            <>
                                                <i className="pi pi-folder-open me-2"></i>
                                                Ouvrir la base
                                            </>
                                        )}
                                    </button>
                                ) : (
                                    <button
                                        className="btn btn-outline-secondary"
                                        onClick={handleDisconnect}
                                    >
                                        <i className="pi pi-sync me-2"></i>
                                        Changer de base
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {connected ? (
                    <div className="container-fluid py-4">
                        {/* Éditeur Visuel */}
                        <Card className="border-0 shadow-sm mb-4">
                            <div className="card-body">
                                <div className="d-flex justify-content-between align-items-center mb-4">
                                    <h3 className="card-title mb-0">Créer votre requête visuellement</h3>
                                    <div className="d-flex gap-2">
                                        <button
                                            className="btn btn-outline-secondary"
                                            onClick={resetQuery}
                                        >
                                            <i className="pi pi-refresh me-2"></i>
                                            Tout effacer
                                        </button>
                                        <button
                                            className="btn btn-info text-white"
                                            onClick={saveCurrentQuery}
                                            disabled={!selectedTable}
                                        >
                                            <i className="pi pi-save me-2"></i>
                                            Sauvegarder
                                        </button>
                                        <button
                                            className="btn btn-success"
                                            onClick={executeVisualQuery}
                                            disabled={!selectedTable || loading}
                                        >
                                            {loading ? (
                                                <>
                                                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                                    Exécution...
                                                </>
                                            ) : (
                                                <>
                                                    <i className="pi pi-play me-2"></i>
                                                    Exécuter la requête
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                <div className="row g-4">
                                    {/* Étape 1: Sélection de table */}
                                    <div className="col-12">
                                        <div className="border-start border-primary border-4 ps-3">
                                            <div className="d-flex align-items-center mb-3">
                                                <span className="badge bg-primary rounded-circle me-3">1</span>
                                                <h5 className="mb-0 flex-grow-1">Choisir une table</h5>
                                                {selectedTable && (
                                                    <span className="badge bg-success">
                                                        {businessDatabases[selectedDb].tables[selectedTable]?.name || selectedTable}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="ms-5">
                                                {!selectedTable ? (
                                                    <button
                                                        className="btn btn-outline-primary"
                                                        onClick={() => setShowTableDialog(true)}
                                                    >
                                                        <i className="pi pi-table me-2"></i>
                                                        Sélectionner une table...
                                                    </button>
                                                ) : (
                                                    <div className="card bg-light">
                                                        <div className="card-body py-2">
                                                            <div className="d-flex align-items-center justify-content-between">
                                                                <div className="d-flex align-items-center">
                                                                    <i className="pi pi-table text-primary me-3 fs-5"></i>
                                                                    <div>
                                                                        <h6 className="mb-0">{businessDatabases[selectedDb].tables[selectedTable]?.name || selectedTable}</h6>
                                                                        <small className="text-muted">{businessDatabases[selectedDb].tables[selectedTable]?.description || `Table ${selectedTable}`}</small>
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    className="btn btn-sm btn-outline-primary"
                                                                    onClick={() => setShowTableDialog(true)}
                                                                >
                                                                    <i className="pi pi-pencil"></i>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Étape 2: Sélection des colonnes */}
                                    {selectedTable && (
                                        <div className="col-12">
                                            <div className="border-start border-primary border-4 ps-3">
                                                <div className="d-flex align-items-center mb-3">
                                                    <span className="badge bg-primary rounded-circle me-3">2</span>
                                                    <h5 className="mb-0">Choisir les colonnes à afficher</h5>
                                                </div>
                                                <div className="ms-5">
                                                    {/*{aggregates.length > 0 && (*/}
                                                    {/*    <div className="alert alert-warning mb-3">*/}
                                                    {/*        <i className="pi pi-info-circle me-2"></i>*/}
                                                    {/*        <small>*/}
                                                    {/*            <strong>Astuce :</strong> Si vous sélectionnez des colonnes ET des calculs,*/}
                                                    {/*            les résultats seront groupés par ces colonnes (comme en SQL avec GROUP BY).*/}
                                                    {/*            Laissez vide pour un calcul global sur toute la table.*/}
                                                    {/*        </small>*/}
                                                    {/*    </div>*/}
                                                    {/*)}*/}
                                                    <div className="row g-3">
                                                        {businessDatabases[selectedDb].tables[selectedTable]?.fields?.map(field => (
                                                            <div key={field.name} className="col-md-6 col-lg-4">
                                                                <div className={`form-check card h-100 ${field.type === 'number' ? 'numeric-column' : ''}`}>
                                                                    <div className="card-body">
                                                                        <Checkbox
                                                                            inputId={field.name}
                                                                            checked={selectedColumns.includes(field.name)}
                                                                            onChange={(e) => {
                                                                                if (e.checked) {
                                                                                    setSelectedColumns([...selectedColumns, field.name]);
                                                                                } else {
                                                                                    setSelectedColumns(selectedColumns.filter(c => c !== field.name));
                                                                                }
                                                                            }}
                                                                        />
                                                                        <label htmlFor={field.name} className="form-check-label ms-2 w-100">
                                                                            <div className="fw-semibold">{field.label || formatColumnLabel(field.name)}</div>
                                                                            <small className={`text-uppercase ${field.type === 'number' ? 'text-primary' : 'text-muted'}`}>
                                                                                {field.type === 'number' ? '🔢 ' : ''}{field.type}
                                                                            </small>
                                                                        </label>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Étape 3: Filtres */}
                                    {selectedTable && (
                                        <div className="col-12">
                                            <div className="border-start border-primary border-4 ps-3">
                                                <div className="d-flex align-items-center mb-3">
                                                    <span className="badge bg-primary rounded-circle me-3">3</span>
                                                    <h5 className="mb-0 flex-grow-1">Ajouter des filtres</h5>
                                                    <button
                                                        className="btn btn-outline-primary btn-sm"
                                                        onClick={() => setShowFilterDialog(true)}
                                                    >
                                                        <i className="pi pi-plus me-2"></i>
                                                        Ajouter un filtre
                                                    </button>
                                                </div>
                                                <div className="ms-5">
                                                    {filters.length === 0 ? (
                                                        <div className="text-center py-4 text-muted">
                                                            <i className="pi pi-filter fs-1 mb-2 d-block"></i>
                                                            <span>Aucun filtre appliqué</span>
                                                        </div>
                                                    ) : (
                                                        <div className="row g-2">
                                                            {filters.map(filter => (
                                                                <div key={filter.id} className="col-12">
                                                                    <div className="alert alert-info d-flex justify-content-between align-items-center py-2">
                                                                        <span>
                                                                            <strong>{filter.label}</strong> {filter.operator} "{filter.value}"
                                                                        </span>
                                                                        <button
                                                                            className="btn btn-sm btn-outline-danger"
                                                                            onClick={() => removeFilter(filter.id)}
                                                                        >
                                                                            <i className="pi pi-times"></i>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Étape 4: Tri */}
                                    {selectedTable && (
                                        <div className="col-12">
                                            <div className="border-start border-primary border-4 ps-3">
                                                <div className="d-flex align-items-center mb-3">
                                                    <span className="badge bg-primary rounded-circle me-3">4</span>
                                                    <h5 className="mb-0 flex-grow-1">Trier les résultats</h5>
                                                    <button
                                                        className="btn btn-outline-primary btn-sm"
                                                        onClick={() => setShowSortDialog(true)}
                                                    >
                                                        <i className="pi pi-sort-alt me-2"></i>
                                                        Ajouter un tri
                                                    </button>
                                                </div>
                                                <div className="ms-5">
                                                    {sorting.length === 0 ? (
                                                        <div className="text-center py-4 text-muted">
                                                            <i className="pi pi-sort-alt fs-1 mb-2 d-block"></i>
                                                            <span>Aucun tri appliqué</span>
                                                        </div>
                                                    ) : (
                                                        <div className="row g-2">
                                                            {sorting.map(sort => (
                                                                <div key={sort.id} className="col-12">
                                                                    <div className="alert alert-warning d-flex justify-content-between align-items-center py-2">
                                                                        <span>
                                                                            <strong>{sort.label}</strong> ({sort.direction === "ASC" ? "Croissant" : "Décroissant"})
                                                                        </span>
                                                                        <button
                                                                            className="btn btn-sm btn-outline-danger"
                                                                            onClick={() => removeSort(sort.id)}
                                                                        >
                                                                            <i className="pi pi-times"></i>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Étape 5: Agrégats (Somme, Moyenne, Compte) */}
                                    {selectedTable && (
                                        <div className="col-12">
                                            <div className="border-start border-primary border-4 ps-3">
                                                <div className="d-flex align-items-center mb-3">
                                                    <span className="badge bg-primary rounded-circle me-3">5</span>
                                                    <h5 className="mb-0 flex-grow-1">Ajouter des calculs (optionnel)</h5>
                                                    <button
                                                        className="btn btn-outline-primary btn-sm"
                                                        onClick={() => setShowAggregateDialog(true)}
                                                    >
                                                        <i className="pi pi-calculator me-2"></i>
                                                        Ajouter un calcul
                                                    </button>
                                                </div>
                                                <div className="ms-5">
                                                    {aggregates.length === 0 ? (
                                                        <div className="text-center py-4 text-muted">
                                                            <i className="pi pi-calculator fs-1 mb-2 d-block"></i>
                                                            <span>Aucun calcul ajouté</span>
                                                        </div>
                                                    ) : (
                                                        <div className="row g-2">
                                                            {aggregates.map(agg => (
                                                                <div key={agg.id} className="col-12">
                                                                    <div className="alert alert-success d-flex justify-content-between align-items-center py-2">
                                                                        <span>
                                                                            <i className="pi pi-calculator me-2"></i>
                                                                            <strong>{agg.label}</strong>
                                                                            {agg.alias && <span className="ms-2 text-muted">({agg.alias})</span>}
                                                                        </span>
                                                                        <button
                                                                            className="btn btn-sm btn-outline-danger"
                                                                            onClick={() => removeAggregate(agg.id)}
                                                                        >
                                                                            <i className="pi pi-times"></i>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Card>

                        {/* Résultats */}
                        {result.length > 0 && (
                            <Card className="border-0 shadow-sm">
                                <div className="card-body">
                                    <div className="d-flex justify-content-between align-items-center mb-3">
                                        <div>
                                            <h3 className="card-title mb-0">
                                                Résultats de la requête
                                                {aggregates.length > 0 && (
                                                    <span className="ms-2 badge bg-primary">
                                                        <i className="pi pi-calculator me-1"></i>
                                                        {aggregates.length} calcul(s)
                                                    </span>
                                                )}
                                            </h3>
                                            {aggregates.length > 0 && selectedColumns.length > 0 && (
                                                <small className="text-muted">
                                                    Les résultats sont groupés par les colonnes sélectionnées
                                                </small>
                                            )}
                                        </div>
                                        <span className="badge bg-success fs-6">{result.length} ligne(s)</span>
                                    </div>

                                    <DataTable
                                        value={result}
                                        paginator
                                        rows={10}
                                        rowsPerPageOptions={[5, 10, 20]}
                                        tableStyle={{ minWidth: '50rem' }}
                                        scrollable
                                        scrollHeight="400px"
                                        className="results-table"
                                    >
                                        {columns.map(col => {
                                            const isCalculation = isCalculationColumn(col.field);

                                            return (
                                                <Column
                                                    key={col.field}
                                                    field={col.field}
                                                    header={
                                                        <div className="d-flex align-items-center">
                                                            {col.header}
                                                            {isCalculation && (
                                                                <i className="pi pi-calculator ms-2 text-primary"
                                                                   title="Colonne calculée"></i>
                                                            )}
                                                        </div>
                                                    }
                                                    sortable
                                                    style={{
                                                        minWidth: '150px',
                                                        backgroundColor: isCalculation ? '#f8f9fa' : 'transparent'
                                                    }}
                                                    body={(rowData) => {
                                                        const value = rowData[col.field];
                                                        if (isCalculation) {
                                                            const agg = aggregates.find(a =>
                                                                a.alias === col.field ||
                                                                col.field.includes(a.type.toLowerCase())
                                                            );
                                                            if (agg) {
                                                                return formatCalculationValue(value, agg.type);
                                                            }
                                                        }
                                                        return value;
                                                    }}
                                                />
                                            );
                                        })}
                                    </DataTable>
                                </div>
                            </Card>
                        )}
                    </div>
                ) : (
                    /* Page d'accueil */
                    <div className="container-fluid py-5">
                        <div className="row justify-content-center">
                            <div className="col-lg-8">
                                <Card className="border-0 shadow text-center">
                                    <div className="card-body py-5">
                                        <i className="pi pi-chart-line text-primary mb-4" style={{ fontSize: '4rem' }}></i>
                                        <h2 className="card-title mb-3">Bienvenue dans l'Assistant de Requêtes</h2>
                                        <p className="card-text text-muted mb-4 fs-5">
                                            Cet outil vous permet d'extraire des données de votre base Oracle sans aucune connaissance technique.<br />
                                            Sélectionnez simplement une base de données pour commencer.
                                        </p>
                                        <div className="row g-4 mt-4">
                                            <div className="col-md-3">
                                                <div className="text-center">
                                                    <i className="pi pi-database text-primary mb-2" style={{ fontSize: '2rem' }}></i>
                                                    <h6>Connexion Oracle réelle</h6>
                                                </div>
                                            </div>
                                            <div className="col-md-3">
                                                <div className="text-center">
                                                    <i className="pi pi-th-large text-primary mb-2" style={{ fontSize: '2rem' }}></i>
                                                    <h6>Sélection par clics</h6>
                                                </div>
                                            </div>
                                            <div className="col-md-3">
                                                <div className="text-center">
                                                    <i className="pi pi-filter text-primary mb-2" style={{ fontSize: '2rem' }}></i>
                                                    <h6>Filtres intuitifs</h6>
                                                </div>
                                            </div>
                                            <div className="col-md-3">
                                                <div className="text-center">
                                                    <i className="pi pi-calculator text-primary mb-2" style={{ fontSize: '2rem' }}></i>
                                                    <h6>Calculs avancés</h6>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* Dialogues */}
            <Dialog header="Choisir une table" visible={showTableDialog}
                    style={{ width: '600px' }} onHide={() => setShowTableDialog(false)}>
                <div className="row g-3">
                    {Object.entries(businessDatabases[selectedDb]?.tables || {}).map(([key, table]) => (
                        <div key={key} className="col-12">
                            <div className="card hover-shadow cursor-pointer" onClick={() => handleTableSelect(key)}>
                                <div className="card-body">
                                    <div className="d-flex align-items-start">
                                        <i className="pi pi-table text-primary me-3 mt-1 fs-5"></i>
                                        <div className="flex-grow-1">
                                            <h6 className="card-title mb-1">{table.name}</h6>
                                            <p className="card-text text-muted mb-1">{table.description}</p>
                                            <small className="text-muted">{table.fields?.length || 0} colonnes disponibles</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </Dialog>

            <Dialog header="Ajouter un filtre" visible={showFilterDialog}
                    style={{ width: '500px' }} onHide={() => setShowFilterDialog(false)}>
                <div className="row g-3">
                    <div className="col-12">
                        <label className="form-label">Colonne</label>
                        <Dropdown
                            value={currentFilter.field}
                            onChange={(e) => setCurrentFilter({...currentFilter, field: e.value})}
                            options={getFieldOptions()}
                            placeholder="Choisir une colonne..."
                            className="w-100"
                        />
                    </div>
                    <div className="col-12">
                        <label className="form-label">Opérateur</label>
                        <Dropdown
                            value={currentFilter.operator}
                            onChange={(e) => setCurrentFilter({...currentFilter, operator: e.value})}
                            options={[
                                { label: "Égal à (=)", value: "=" },
                                { label: "Différent de (!=)", value: "!=" },
                                { label: "Supérieur à (>)", value: ">" },
                                { label: "Inférieur à (<)", value: "<" },
                                { label: "Supérieur ou égal (>=)", value: ">=" },
                                { label: "Inférieur ou égal (<=)", value: "<=" },
                                { label: "Contient", value: "contient" }
                            ]}
                            className="w-100"
                        />
                    </div>
                    <div className="col-12">
                        <label className="form-label">Valeur</label>
                        <InputText
                            value={currentFilter.value}
                            onChange={(e) => setCurrentFilter({...currentFilter, value: e.target.value})}
                            placeholder="Saisir la valeur..."
                            className="w-100"
                        />
                    </div>
                </div>
                <div className="d-flex justify-content-end gap-2 mt-4">
                    <button className="btn btn-outline-secondary" onClick={() => setShowFilterDialog(false)}>
                        <i className="pi pi-times me-2"></i>
                        Annuler
                    </button>
                    <button className="btn btn-primary" onClick={addFilter}>
                        <i className="pi pi-check me-2"></i>
                        Ajouter
                    </button>
                </div>
            </Dialog>

            <Dialog header="Trier les résultats" visible={showSortDialog}
                    style={{ width: '500px' }} onHide={() => setShowSortDialog(false)}>
                <div className="row g-3">
                    <div className="col-12">
                        <label className="form-label">Colonne à trier</label>
                        <Dropdown
                            value={currentSort.field}
                            onChange={(e) => setCurrentSort({...currentSort, field: e.value})}
                            options={getFieldOptions()}
                            placeholder="Choisir une colonne..."
                            className="w-100"
                        />
                    </div>
                    <div className="col-12">
                        <label className="form-label">Ordre de tri</label>
                        <div className="d-flex gap-4">
                            <div className="form-check">
                                <RadioButton
                                    inputId="sort_asc"
                                    name="sort_direction"
                                    value="ASC"
                                    onChange={(e) => setCurrentSort({...currentSort, direction: e.value})}
                                    checked={currentSort.direction === "ASC"}
                                />
                                <label htmlFor="sort_asc" className="form-check-label ms-2">Croissant (A-Z, 0-9)</label>
                            </div>
                            <div className="form-check">
                                <RadioButton
                                    inputId="sort_desc"
                                    name="sort_direction"
                                    value="DESC"
                                    onChange={(e) => setCurrentSort({...currentSort, direction: e.value})}
                                    checked={currentSort.direction === "DESC"}
                                />
                                <label htmlFor="sort_desc" className="form-check-label ms-2">Décroissant (Z-A, 9-0)</label>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="d-flex justify-content-end gap-2 mt-4">
                    <button className="btn btn-outline-secondary" onClick={() => setShowSortDialog(false)}>
                        <i className="pi pi-times me-2"></i>
                        Annuler
                    </button>
                    <button className="btn btn-primary" onClick={addSort}>
                        <i className="pi pi-check me-2"></i>
                        Ajouter
                    </button>
                </div>
            </Dialog>

            {/* Dialogue pour les agrégats */}
            <Dialog header="Ajouter un calcul" visible={showAggregateDialog}
                    style={{ width: '500px' }} onHide={() => setShowAggregateDialog(false)}>
                <div className="row g-3">
                    <div className="col-12">
                        <label className="form-label">Type de calcul</label>
                        <Dropdown
                            value={currentAggregate.type}
                            onChange={(e) => setCurrentAggregate({...currentAggregate, type: e.value})}
                            options={[
                                { label: "Somme (addition)", value: "SUM" },
                                { label: "Moyenne", value: "AVG" },
                                { label: "Compte", value: "COUNT" }
                            ]}
                            placeholder="Choisir un type de calcul..."
                            className="w-100"
                        />
                        <small className="text-muted">
                            {currentAggregate.type === 'COUNT'
                                ? "Compte le nombre d'enregistrements"
                                : currentAggregate.type === 'SUM'
                                    ? "Additionne les valeurs numériques"
                                    : "Calcule la moyenne des valeurs numériques"}
                        </small>
                    </div>

                    <div className="col-12">
                        <label className="form-label">
                            {currentAggregate.type === 'COUNT'
                                ? 'Colonne à compter (optionnel)'
                                : 'Colonne(s) numérique(s)'}
                        </label>
                        <div className="card aggregate-columns-list">
                            <div className="card-body p-3">
                                {currentAggregate.type === 'COUNT' ? (
                                    <>
                                        <div className="form-check mb-2">
                                            <RadioButton
                                                inputId="count_all"
                                                name="count_type"
                                                checked={currentAggregate.columns.length === 0}
                                                onChange={() => setCurrentAggregate({
                                                    ...currentAggregate,
                                                    columns: []
                                                })}
                                            />
                                            <label htmlFor="count_all" className="form-check-label ms-2">
                                                Compter tous les enregistrements (COUNT(*))
                                            </label>
                                        </div>
                                        <div className="form-check mb-2">
                                            <RadioButton
                                                inputId="count_column"
                                                name="count_type"
                                                checked={currentAggregate.columns.length > 0}
                                                onChange={() => {}}
                                            />
                                            <label htmlFor="count_column" className="form-check-label ms-2">
                                                Compter les valeurs non-nulles d'une colonne
                                            </label>
                                        </div>
                                        {currentAggregate.columns.length > 0 && (
                                            <div className="ms-4 mt-2">
                                                {getFieldOptions().map(field => (
                                                    <div key={field.value} className="form-check mb-2">
                                                        <Checkbox
                                                            inputId={`count_${field.value}`}
                                                            checked={currentAggregate.columns.includes(field.value)}
                                                            onChange={(e) => {
                                                                if (e.checked) {
                                                                    setCurrentAggregate({
                                                                        ...currentAggregate,
                                                                        columns: [field.value]
                                                                    });
                                                                } else {
                                                                    setCurrentAggregate({
                                                                        ...currentAggregate,
                                                                        columns: []
                                                                    });
                                                                }
                                                            }}
                                                        />
                                                        <label htmlFor={`count_${field.value}`} className="form-check-label ms-2">
                                                            {field.label}
                                                        </label>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    getFieldOptions().map(field => (
                                        <div key={field.value} className="form-check mb-2">
                                            <Checkbox
                                                inputId={`agg_${field.value}`}
                                                checked={currentAggregate.columns.includes(field.value)}
                                                onChange={(e) => {
                                                    if (e.checked) {
                                                        setCurrentAggregate({
                                                            ...currentAggregate,
                                                            columns: [...currentAggregate.columns, field.value]
                                                        });
                                                    } else {
                                                        setCurrentAggregate({
                                                            ...currentAggregate,
                                                            columns: currentAggregate.columns.filter(c => c !== field.value)
                                                        });
                                                    }
                                                }}
                                                disabled={field.type !== 'number'}
                                            />
                                            <label
                                                htmlFor={`agg_${field.value}`}
                                                className={`form-check-label ms-2 ${field.type === 'number' ? 'numeric-column' : 'text-muted'}`}
                                            >
                                                {field.label}
                                                {field.type === 'number' && ' 🔢'}
                                                {field.type !== 'number' && ' (non numérique)'}
                                            </label>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                        <small className="text-muted">
                            {currentAggregate.type === 'COUNT' && currentAggregate.columns.length === 0
                                ? "Comptera tous les enregistrements de la table"
                                : currentAggregate.type === 'COUNT'
                                    ? "Comptera seulement les enregistrements où cette colonne n'est pas NULL"
                                    : "Sélectionnez une ou plusieurs colonnes numériques"}
                        </small>
                    </div>

                    <div className="col-12">
                        <label className="form-label">Nom personnalisé (alias)</label>
                        <InputText
                            value={currentAggregate.alias}
                            onChange={(e) => setCurrentAggregate({...currentAggregate, alias: e.target.value})}
                            placeholder={`Ex: total_ventes, moyenne_salaire, compte_clients...`}
                            className="w-100"
                        />
                        <small className="text-muted">
                            Ce nom sera utilisé comme nom de colonne dans les résultats
                        </small>
                    </div>
                </div>
                <div className="d-flex justify-content-end gap-2 mt-4">
                    <button className="btn btn-outline-secondary" onClick={() => setShowAggregateDialog(false)}>
                        <i className="pi pi-times me-2"></i>
                        Annuler
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={addAggregate}
                        disabled={!currentAggregate.type ||
                            (currentAggregate.type !== 'COUNT' && currentAggregate.columns.length === 0)}
                    >
                        <i className="pi pi-check me-2"></i>
                        Ajouter
                    </button>
                </div>
            </Dialog>

            {/* Dialogue de sauvegarde de requête */}
            <Dialog header="Sauvegarder la requête" visible={showSaveQueryDialog}
                    style={{ width: '500px' }} onHide={() => setShowSaveQueryDialog(false)}>
                <div className="p-fluid">
                    <div className="field">
                        <label htmlFor="queryName" className="form-label">Nom de la requête</label>
                        <InputText
                            id="queryName"
                            value={queryName}
                            onChange={(e) => setQueryName(e.target.value)}
                            placeholder="Donnez un nom à votre requête..."
                            className="w-100"
                        />
                        <small className="text-muted">
                            Exemples: "Écritures validées", "Clients Grands Comptes", "Commandes en cours"
                        </small>
                    </div>
                    <div className="mt-3 p-3 bg-light rounded">
                        <small>
                            <strong>Cette requête contient :</strong><br/>
                            • Table: {businessDatabases[selectedDb]?.tables[selectedTable]?.name || selectedTable}<br/>
                            • Colonnes: {selectedColumns.length} sélectionnée(s)<br/>
                            • Filtres: {filters.length} appliqué(s)<br/>
                            • Tris: {sorting.length} appliqué(s)<br/>
                            • Calculs: {aggregates.length} appliqué(s)
                        </small>
                    </div>
                </div>
                <div className="d-flex justify-content-end gap-2 mt-4">
                    <button className="btn btn-outline-secondary" onClick={() => setShowSaveQueryDialog(false)}>
                        <i className="pi pi-times me-2"></i>
                        Annuler
                    </button>
                    <button className="btn btn-primary" onClick={confirmSaveQuery}>
                        <i className="pi pi-save me-2"></i>
                        Sauvegarder
                    </button>
                </div>
            </Dialog>

            {/* Dialogue de chargement des requêtes sauvegardées */}
            <Dialog header="Mes requêtes sauvegardées" visible={showLoadQueryDialog}
                    style={{ width: '600px' }} onHide={() => setShowLoadQueryDialog(false)}>
                {savedQueries.length === 0 ? (
                    <div className="text-center py-4">
                        <i className="pi pi-inbox fs-1 text-muted mb-3 d-block"></i>
                        <p className="text-muted">Aucune requête sauvegardée</p>
                        <small>Créez et sauvegardez vos premières requêtes pour les retrouver ici</small>
                    </div>
                ) : (
                    <div className="row g-3">
                        {savedQueries.map(query => (
                            <div key={query.id} className="col-12">
                                <div
                                    className="card hover-shadow cursor-pointer"
                                    onClick={() => loadSavedQuery(query)}
                                >
                                    <div className="card-body">
                                        <div className="d-flex justify-content-between align-items-start">
                                            <div className="flex-grow-1">
                                                <h6 className="card-title mb-1">{query.name}</h6>
                                                <p className="card-text text-muted mb-1 small">
                                                    {businessDatabases[query.database]?.name} → {businessDatabases[query.database]?.tables[query.table]?.name || query.table}
                                                </p>
                                                <div className="small text-muted">
                                                    <span className="me-3"> {query.columns.length} colonnes</span>
                                                    <span className="me-3"> {query.filters.length} filtres</span>
                                                    <span className="me-3"> {query.sorting.length} tris</span>
                                                    <span> {query.aggregates.length} calculs</span>
                                                </div>
                                                <small className="text-muted">
                                                    Créée le {new Date(query.createdAt).toLocaleDateString()}
                                                </small>
                                            </div>
                                            <button
                                                className="btn btn-sm btn-outline-danger"
                                                onClick={(e) => deleteSavedQuery(query.id, e)}
                                            >
                                                <i className="pi pi-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Dialog>
        </div>
    );
}
// import React, { useState, useRef } from "react";
// import { Dropdown } from "primereact/dropdown";
// import { Toast } from "primereact/toast";
// import { DataTable } from "primereact/datatable";
// import { Column } from "primereact/column";
// import { Card } from "primereact/card";
// import { Dialog } from "primereact/dialog";
// import { Checkbox } from "primereact/checkbox";
// import { InputText } from "primereact/inputtext";
// import { RadioButton } from "primereact/radiobutton";
//
// import "primereact/resources/themes/lara-light-blue/theme.css";
// import "primereact/resources/primereact.min.css";
// import "primeicons/primeicons.css";
// import "bootstrap/dist/css/bootstrap.min.css";
// import "./App.css";
//
// export default function App() {
//     const toast = useRef();
//     const [selectedDb, setSelectedDb] = useState(null);
//     const [connected, setConnected] = useState(false);
//     const [result, setResult] = useState([]);
//     const [columns, setColumns] = useState([]);
//     const [loading, setLoading] = useState(false);
//
//     // États pour l'interface visuelle
//     const [selectedTable, setSelectedTable] = useState(null);
//     const [selectedColumns, setSelectedColumns] = useState([]);
//     const [filters, setFilters] = useState([]);
//     const [sorting, setSorting] = useState([]);
//     const [showTableDialog, setShowTableDialog] = useState(false);
//     const [showFilterDialog, setShowFilterDialog] = useState(false);
//     const [showSortDialog, setShowSortDialog] = useState(false);
//     const [currentFilter, setCurrentFilter] = useState({ field: "", operator: "=", value: "" });
//     const [currentSort, setCurrentSort] = useState({ field: "", direction: "ASC" });
//
//     // États pour la gestion des requêtes sauvegardées
//     const [savedQueries, setSavedQueries] = useState([]);
//     const [showSaveQueryDialog, setShowSaveQueryDialog] = useState(false);
//     const [queryName, setQueryName] = useState("");
//     const [showLoadQueryDialog, setShowLoadQueryDialog] = useState(false);
//     const [selectedQuery, setSelectedQuery] = useState(null);
//
//     // Structure simplifiée pour utilisateurs métier
//     const BUSINESS_DATABASES = {
//         "COMPTABILITE": {
//             name: "Base Comptabilité",
//             description: "Données financières et comptables",
//             tables: {
//                 "ECRITURES": {
//                     name: "Écritures Comptables",
//                     description: "Toutes les écritures comptables",
//                     fields: [
//                         { name: "NUMERO_ECRITURE", type: "number", label: "N° Écriture" },
//                         { name: "DATE_ECRITURE", type: "date", label: "Date Écriture" },
//                         { name: "COMPTE_DEBIT", type: "text", label: "Compte Débit" },
//                         { name: "COMPTE_CREDIT", type: "text", label: "Compte Crédit" },
//                         { name: "MONTANT", type: "number", label: "Montant" },
//                         { name: "LIBELLE", type: "text", label: "Libellé" },
//                         { name: "JOURNAL", type: "text", label: "Journal" },
//                         { name: "STATUT", type: "text", label: "Statut" }
//                     ],
//                     sampleData: [
//                         { NUMERO_ECRITURE: 1001, DATE_ECRITURE: "2024-01-15", COMPTE_DEBIT: "512000", COMPTE_CREDIT: "411000", MONTANT: 1500.00, LIBELLE: "Vente client DUPONT", JOURNAL: "VT", STATUT: "Validé" },
//                         { NUMERO_ECRITURE: 1002, DATE_ECRITURE: "2024-01-16", COMPTE_DEBIT: "606000", COMPTE_CREDIT: "401000", MONTANT: 800.50, LIBELLE: "Achat fournisseur MARTIN", JOURNAL: "ACH", STATUT: "Validé" },
//                         { NUMERO_ECRITURE: 1003, DATE_ECRITURE: "2024-01-17", COMPTE_DEBIT: "512000", COMPTE_CREDIT: "706000", MONTANT: 2300.00, LIBELLE: "Vente service", JOURNAL: "VT", STATUT: "Brouillon" }
//                     ]
//                 },
//                 "CLIENTS": {
//                     name: "Clients",
//                     description: "Liste des clients",
//                     fields: [
//                         { name: "CODE_CLIENT", type: "text", label: "Code Client" },
//                         { name: "NOM_CLIENT", type: "text", label: "Nom Client" },
//                         { name: "VILLE", type: "text", label: "Ville" },
//                         { name: "CATEGORIE", type: "text", label: "Catégorie" },
//                         { name: "CHIFFRE_AFFAIRE", type: "number", label: "Chiffre d'Affaire" }
//                     ],
//                     sampleData: [
//                         { CODE_CLIENT: "CLI001", NOM_CLIENT: "DUPONT SARL", VILLE: "Paris", CATEGORIE: "Grand Compte", CHIFFRE_AFFAIRE: 150000 },
//                         { CODE_CLIENT: "CLI002", NOM_CLIENT: "MARTIN SA", VILLE: "Lyon", CATEGORIE: "PME", CHIFFRE_AFFAIRE: 75000 }
//                     ]
//                 }
//             }
//         },
//         "VENTES": {
//             name: "Base Ventes",
//             description: "Données commerciales et ventes",
//             tables: {
//                 "COMMANDES": {
//                     name: "Commandes Clients",
//                     description: "Toutes les commandes clients",
//                     fields: [
//                         { name: "NUMERO_COMMANDE", type: "number", label: "N° Commande" },
//                         { name: "DATE_COMMANDE", type: "date", label: "Date Commande" },
//                         { name: "CLIENT", type: "text", label: "Client" },
//                         { name: "MONTANT_TTC", type: "number", label: "Montant TTC" },
//                         { name: "STATUT", type: "text", label: "Statut" }
//                     ],
//                     sampleData: [
//                         { NUMERO_COMMANDE: 5001, DATE_COMMANDE: "2024-01-10", CLIENT: "DUPONT SARL", MONTANT_TTC: 2500.00, STATUT: "Livré" },
//                         { NUMERO_COMMANDE: 5002, DATE_COMMANDE: "2024-01-11", CLIENT: "DURAND EURL", MONTANT_TTC: 1500.00, STATUT: "En cours" }
//                     ]
//                 }
//             }
//         }
//     };
//
//     const databases = Object.keys(BUSINESS_DATABASES).map(key => ({
//         label: BUSINESS_DATABASES[key].name,
//         value: key,
//         description: BUSINESS_DATABASES[key].description
//     }));
//
//     // Générer un nom de requête par défaut
//     const generateDefaultQueryName = () => {
//         const count = savedQueries.length + 1;
//         return `Requête ${count}`;
//     };
//
//     // Sauvegarder la requête actuelle
//     const saveCurrentQuery = () => {
//         if (!selectedTable) {
//             toast.current.show({
//                 severity: 'warn',
//                 summary: 'Requête incomplète',
//                 detail: 'Veuillez d\'abord configurer une requête'
//             });
//             return;
//         }
//
//         const defaultName = generateDefaultQueryName();
//         setQueryName(defaultName);
//         setShowSaveQueryDialog(true);
//     };
//
//     // Confirmer la sauvegarde
//     const confirmSaveQuery = () => {
//         const queryToSave = {
//             id: `query_${Date.now()}`,
//             name: queryName || generateDefaultQueryName(),
//             database: selectedDb,
//             table: selectedTable,
//             columns: [...selectedColumns],
//             filters: [...filters],
//             sorting: [...sorting],
//             createdAt: new Date().toISOString()
//         };
//
//         setSavedQueries([...savedQueries, queryToSave]);
//         setShowSaveQueryDialog(false);
//         setQueryName("");
//
//         toast.current.show({
//             severity: 'success',
//             summary: 'Requête sauvegardée !',
//             detail: `"${queryToSave.name}" a été enregistrée`
//         });
//     };
//
//     // Charger une requête sauvegardée
//     const loadSavedQuery = (query) => {
//         setSelectedDb(query.database);
//         setSelectedTable(query.table);
//         setSelectedColumns([...query.columns]);
//         setFilters([...query.filters]);
//         setSorting([...query.sorting]);
//         setShowLoadQueryDialog(false);
//
//         toast.current.show({
//             severity: 'success',
//             summary: 'Requête chargée',
//             detail: `"${query.name}" a été chargée`
//         });
//     };
//
//     // Supprimer une requête sauvegardée
//     const deleteSavedQuery = (queryId, event) => {
//         event.stopPropagation();
//         const queryToDelete = savedQueries.find(q => q.id === queryId);
//         setSavedQueries(savedQueries.filter(q => q.id !== queryId));
//
//         toast.current.show({
//             severity: 'info',
//             summary: 'Requête supprimée',
//             detail: `"${queryToDelete.name}" a été supprimée`
//         });
//     };
//
//     // Connexion simplifiée
//     const handleConnect = () => {
//         if (!selectedDb) return;
//
//         setLoading(true);
//         setTimeout(() => {
//             setConnected(true);
//             setLoading(false);
//             toast.current.show({
//                 severity: 'success',
//                 summary: 'Connecté',
//                 detail: `Base ${BUSINESS_DATABASES[selectedDb].name} ouverte`
//             });
//         }, 500);
//     };
//
//     const handleDisconnect = () => {
//         setConnected(false);
//         setSelectedDb(null);
//         setSelectedTable(null);
//         setSelectedColumns([]);
//         setFilters([]);
//         setSorting([]);
//         setResult([]);
//     };
//
//     // Sélection de table
//     const handleTableSelect = (tableKey) => {
//         setSelectedTable(tableKey);
//         setSelectedColumns(BUSINESS_DATABASES[selectedDb].tables[tableKey].fields.map(f => f.name));
//         setShowTableDialog(false);
//         toast.current.show({
//             severity: 'info',
//             summary: 'Table sélectionnée',
//             detail: BUSINESS_DATABASES[selectedDb].tables[tableKey].name
//         });
//     };
//
//     // Ajout de filtre
//     const addFilter = () => {
//         if (!currentFilter.field || !currentFilter.value) return;
//
//         const newFilter = {
//             id: `filter_${Date.now()}`,
//             ...currentFilter,
//             label: BUSINESS_DATABASES[selectedDb].tables[selectedTable].fields.find(f => f.name === currentFilter.field)?.label
//         };
//
//         setFilters([...filters, newFilter]);
//         setCurrentFilter({ field: "", operator: "=", value: "" });
//         setShowFilterDialog(false);
//     };
//
//     // Ajout de tri
//     const addSort = () => {
//         if (!currentSort.field) return;
//
//         const newSort = {
//             id: `sort_${Date.now()}`,
//             ...currentSort,
//             label: BUSINESS_DATABASES[selectedDb].tables[selectedTable].fields.find(f => f.name === currentSort.field)?.label
//         };
//
//         setSorting([...sorting, newSort]);
//         setCurrentSort({ field: "", direction: "ASC" });
//         setShowSortDialog(false);
//     };
//
//     // Suppression de filtre/tri
//     const removeFilter = (id) => {
//         setFilters(filters.filter(f => f.id !== id));
//     };
//
//     const removeSort = (id) => {
//         setSorting(sorting.filter(s => s.id !== id));
//     };
//
//     // Exécution de la requête visuelle
//     const executeVisualQuery = () => {
//         if (!selectedTable) {
//             toast.current.show({
//                 severity: 'warn',
//                 summary: 'Table manquante',
//                 detail: 'Veuillez sélectionner une table'
//             });
//             return;
//         }
//
//         setLoading(true);
//
//         setTimeout(() => {
//             let resultData = [...BUSINESS_DATABASES[selectedDb].tables[selectedTable].sampleData];
//
//             // Application des filtres
//             filters.forEach(filter => {
//                 resultData = resultData.filter(row => {
//                     const rowValue = row[filter.field];
//                     const filterValue = filter.value;
//
//                     switch(filter.operator) {
//                         case "=": return String(rowValue) === String(filterValue);
//                         case "!=": return String(rowValue) !== String(filterValue);
//                         case ">": return Number(rowValue) > Number(filterValue);
//                         case "<": return Number(rowValue) < Number(filterValue);
//                         case ">=": return Number(rowValue) >= Number(filterValue);
//                         case "<=": return Number(rowValue) <= Number(filterValue);
//                         case "contient": return String(rowValue).toLowerCase().includes(String(filterValue).toLowerCase());
//                         default: return true;
//                     }
//                 });
//             });
//
//             // Application du tri
//             if (sorting.length > 0) {
//                 resultData.sort((a, b) => {
//                     for (const sort of sorting) {
//                         const aVal = a[sort.field];
//                         const bVal = b[sort.field];
//                         if (aVal !== bVal) {
//                             return sort.direction === "ASC"
//                                 ? (aVal < bVal ? -1 : 1)
//                                 : (aVal > bVal ? -1 : 1);
//                         }
//                     }
//                     return 0;
//                 });
//             }
//
//             // Sélection des colonnes
//             const finalData = resultData.map(row => {
//                 const selectedRow = {};
//                 selectedColumns.forEach(col => {
//                     selectedRow[col] = row[col];
//                 });
//                 return selectedRow;
//             });
//
//             setResult(finalData);
//             setColumns(selectedColumns.map(col => ({
//                 field: col,
//                 header: BUSINESS_DATABASES[selectedDb].tables[selectedTable].fields.find(f => f.name === col)?.label || col
//             })));
//
//             setLoading(false);
//
//             toast.current.show({
//                 severity: 'success',
//                 summary: 'Requête exécutée',
//                 detail: `${finalData.length} résultat(s) trouvé(s)`
//             });
//         }, 1000);
//     };
//
//     // Réinitialisation
//     const resetQuery = () => {
//         setSelectedTable(null);
//         setSelectedColumns([]);
//         setFilters([]);
//         setSorting([]);
//         setResult([]);
//     };
//
//     return (
//         <div className="app-container vh-100 vw-100l bg-light">
//             <Toast ref={toast} position="top-right" />
//
//             {/* Header Bootstrap */}
//             <header className="bg-white shadow-sm border-bottom">
//                 <div className="container-fluid">
//                     <div className="row align-items-center py-3">
//                         <div className="col">
//                             <div className="d-flex align-items-center">
//                                 <i className="pi pi-table fs-1 text-primary me-3"></i>
//                                 <div>
//                                     <h1 className="h3 mb-0 text-dark">Assistant de Requêtes Métier</h1>
//                                     <small className="text-muted">Interface 100% visuelle - Aucune connaissance SQL requise</small>
//                                 </div>
//                             </div>
//                         </div>
//                         <div className="col-auto">
//                             <div className="d-flex gap-2">
//                                 <button
//                                     className="btn btn-outline-primary"
//                                     onClick={() => setShowLoadQueryDialog(true)}
//                                     disabled={savedQueries.length === 0}
//                                 >
//                                     <i className="pi pi-folder me-2"></i>
//                                     Mes requêtes
//                                 </button>
//                                 <button
//                                     className="btn btn-info text-white"
//                                     onClick={saveCurrentQuery}
//                                     disabled={!selectedTable}
//                                 >
//                                     <i className="pi pi-save me-2"></i>
//                                     Sauvegarder
//                                 </button>
//                             </div>
//                         </div>
//                     </div>
//                 </div>
//             </header>
//
//             <main className="container-fluid p-0">
//                 {/* Barre de connexion */}
//                 <div className="bg-light border-bottom">
//                     <div className="container-fluid py-3">
//                         <div className="row align-items-center">
//                             <div className="col-md-8">
//                                 <div className="d-flex align-items-center gap-3">
//                                     <Dropdown
//                                         value={selectedDb}
//                                         onChange={e => setSelectedDb(e.value)}
//                                         options={databases}
//                                         placeholder="Choisir une base de données..."
//                                         className="w-auto min-w-300"
//                                         disabled={connected}
//                                     />
//                                     {selectedDb && (
//                                         <span className="text-muted">
//                                             {BUSINESS_DATABASES[selectedDb].description}
//                                         </span>
//                                     )}
//                                 </div>
//                             </div>
//                             <div className="col-md-4 text-end">
//                                 {!connected ? (
//                                     <button
//                                         className="btn btn-primary"
//                                         onClick={handleConnect}
//                                         disabled={!selectedDb || loading}
//                                     >
//                                         {loading ? (
//                                             <>
//                                                 <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
//                                                 Connexion...
//                                             </>
//                                         ) : (
//                                             <>
//                                                 <i className="pi pi-folder-open me-2"></i>
//                                                 Ouvrir la base
//                                             </>
//                                         )}
//                                     </button>
//                                 ) : (
//                                     <button
//                                         className="btn btn-outline-secondary"
//                                         onClick={handleDisconnect}
//                                     >
//                                         <i className="pi pi-sync me-2"></i>
//                                         Changer de base
//                                     </button>
//                                 )}
//                             </div>
//                         </div>
//                     </div>
//                 </div>
//
//                 {connected ? (
//                     <div className="container-fluid py-4">
//                         {/* Éditeur Visuel */}
//                         <Card className="border-0 shadow-sm mb-4">
//                             <div className="card-body">
//                                 <div className="d-flex justify-content-between align-items-center mb-4">
//                                     <h3 className="card-title mb-0">Créer votre requête visuellement</h3>
//                                     <div className="d-flex gap-2">
//                                         <button
//                                             className="btn btn-outline-secondary"
//                                             onClick={resetQuery}
//                                         >
//                                             <i className="pi pi-refresh me-2"></i>
//                                             Tout effacer
//                                         </button>
//                                         <button
//                                             className="btn btn-info text-white"
//                                             onClick={saveCurrentQuery}
//                                             disabled={!selectedTable}
//                                         >
//                                             <i className="pi pi-save me-2"></i>
//                                             Sauvegarder
//                                         </button>
//                                         <button
//                                             className="btn btn-success"
//                                             onClick={executeVisualQuery}
//                                             disabled={!selectedTable || loading}
//                                         >
//                                             {loading ? (
//                                                 <>
//                                                     <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
//                                                     Exécution...
//                                                 </>
//                                             ) : (
//                                                 <>
//                                                     <i className="pi pi-play me-2"></i>
//                                                     Exécuter la requête
//                                                 </>
//                                             )}
//                                         </button>
//                                     </div>
//                                 </div>
//
//                                 <div className="row g-4">
//                                     {/* Étape 1: Sélection de table */}
//                                     <div className="col-12">
//                                         <div className="border-start border-primary border-4 ps-3">
//                                             <div className="d-flex align-items-center mb-3">
//                                                 <span className="badge bg-primary rounded-circle me-3">1</span>
//                                                 <h5 className="mb-0 flex-grow-1">Choisir une table</h5>
//                                                 {selectedTable && (
//                                                     <span className="badge bg-success">
//                                                         {BUSINESS_DATABASES[selectedDb].tables[selectedTable].name}
//                                                     </span>
//                                                 )}
//                                             </div>
//                                             <div className="ms-5">
//                                                 {!selectedTable ? (
//                                                     <button
//                                                         className="btn btn-outline-primary"
//                                                         onClick={() => setShowTableDialog(true)}
//                                                     >
//                                                         <i className="pi pi-table me-2"></i>
//                                                         Sélectionner une table...
//                                                     </button>
//                                                 ) : (
//                                                     <div className="card bg-light">
//                                                         <div className="card-body py-2">
//                                                             <div className="d-flex align-items-center justify-content-between">
//                                                                 <div className="d-flex align-items-center">
//                                                                     <i className="pi pi-table text-primary me-3 fs-5"></i>
//                                                                     <div>
//                                                                         <h6 className="mb-0">{BUSINESS_DATABASES[selectedDb].tables[selectedTable].name}</h6>
//                                                                         <small className="text-muted">{BUSINESS_DATABASES[selectedDb].tables[selectedTable].description}</small>
//                                                                     </div>
//                                                                 </div>
//                                                                 <button
//                                                                     className="btn btn-sm btn-outline-primary"
//                                                                     onClick={() => setShowTableDialog(true)}
//                                                                 >
//                                                                     <i className="pi pi-pencil"></i>
//                                                                 </button>
//                                                             </div>
//                                                         </div>
//                                                     </div>
//                                                 )}
//                                             </div>
//                                         </div>
//                                     </div>
//
//                                     {/* Étape 2: Sélection des colonnes */}
//                                     {selectedTable && (
//                                         <div className="col-12">
//                                             <div className="border-start border-primary border-4 ps-3">
//                                                 <div className="d-flex align-items-center mb-3">
//                                                     <span className="badge bg-primary rounded-circle me-3">2</span>
//                                                     <h5 className="mb-0">Choisir les colonnes à afficher</h5>
//                                                 </div>
//                                                 <div className="ms-5">
//                                                     <div className="row g-3">
//                                                         {BUSINESS_DATABASES[selectedDb].tables[selectedTable].fields.map(field => (
//                                                             <div key={field.name} className="col-md-6 col-lg-4">
//                                                                 <div className="form-check card h-100">
//                                                                     <div className="card-body">
//                                                                         <Checkbox
//                                                                             inputId={field.name}
//                                                                             checked={selectedColumns.includes(field.name)}
//                                                                             onChange={(e) => {
//                                                                                 if (e.checked) {
//                                                                                     setSelectedColumns([...selectedColumns, field.name]);
//                                                                                 } else {
//                                                                                     setSelectedColumns(selectedColumns.filter(c => c !== field.name));
//                                                                                 }
//                                                                             }}
//                                                                         />
//                                                                         <label htmlFor={field.name} className="form-check-label ms-2 w-100">
//                                                                             <div className="fw-semibold">{field.label}</div>
//                                                                             <small className="text-muted text-uppercase">{field.type}</small>
//                                                                         </label>
//                                                                     </div>
//                                                                 </div>
//                                                             </div>
//                                                         ))}
//                                                     </div>
//                                                 </div>
//                                             </div>
//                                         </div>
//                                     )}
//
//                                     {/* Étape 3: Filtres */}
//                                     {selectedTable && (
//                                         <div className="col-12">
//                                             <div className="border-start border-primary border-4 ps-3">
//                                                 <div className="d-flex align-items-center mb-3">
//                                                     <span className="badge bg-primary rounded-circle me-3">3</span>
//                                                     <h5 className="mb-0 flex-grow-1">Ajouter des filtres</h5>
//                                                     <button
//                                                         className="btn btn-outline-primary btn-sm"
//                                                         onClick={() => setShowFilterDialog(true)}
//                                                     >
//                                                         <i className="pi pi-plus me-2"></i>
//                                                         Ajouter un filtre
//                                                     </button>
//                                                 </div>
//                                                 <div className="ms-5">
//                                                     {filters.length === 0 ? (
//                                                         <div className="text-center py-4 text-muted">
//                                                             <i className="pi pi-filter fs-1 mb-2 d-block"></i>
//                                                             <span>Aucun filtre appliqué</span>
//                                                         </div>
//                                                     ) : (
//                                                         <div className="row g-2">
//                                                             {filters.map(filter => (
//                                                                 <div key={filter.id} className="col-12">
//                                                                     <div className="alert alert-info d-flex justify-content-between align-items-center py-2">
//                                                                         <span>
//                                                                             <strong>{filter.label}</strong> {filter.operator} "{filter.value}"
//                                                                         </span>
//                                                                         <button
//                                                                             className="btn btn-sm btn-outline-danger"
//                                                                             onClick={() => removeFilter(filter.id)}
//                                                                         >
//                                                                             <i className="pi pi-times"></i>
//                                                                         </button>
//                                                                     </div>
//                                                                 </div>
//                                                             ))}
//                                                         </div>
//                                                     )}
//                                                 </div>
//                                             </div>
//                                         </div>
//                                     )}
//
//                                     {/* Étape 4: Tri */}
//                                     {selectedTable && (
//                                         <div className="col-12">
//                                             <div className="border-start border-primary border-4 ps-3">
//                                                 <div className="d-flex align-items-center mb-3">
//                                                     <span className="badge bg-primary rounded-circle me-3">4</span>
//                                                     <h5 className="mb-0 flex-grow-1">Trier les résultats</h5>
//                                                     <button
//                                                         className="btn btn-outline-primary btn-sm"
//                                                         onClick={() => setShowSortDialog(true)}
//                                                     >
//                                                         <i className="pi pi-sort-alt me-2"></i>
//                                                         Ajouter un tri
//                                                     </button>
//                                                 </div>
//                                                 <div className="ms-5">
//                                                     {sorting.length === 0 ? (
//                                                         <div className="text-center py-4 text-muted">
//                                                             <i className="pi pi-sort-alt fs-1 mb-2 d-block"></i>
//                                                             <span>Aucun tri appliqué</span>
//                                                         </div>
//                                                     ) : (
//                                                         <div className="row g-2">
//                                                             {sorting.map(sort => (
//                                                                 <div key={sort.id} className="col-12">
//                                                                     <div className="alert alert-warning d-flex justify-content-between align-items-center py-2">
//                                                                         <span>
//                                                                             <strong>{sort.label}</strong> ({sort.direction === "ASC" ? "Croissant" : "Décroissant"})
//                                                                         </span>
//                                                                         <button
//                                                                             className="btn btn-sm btn-outline-danger"
//                                                                             onClick={() => removeSort(sort.id)}
//                                                                         >
//                                                                             <i className="pi pi-times"></i>
//                                                                         </button>
//                                                                     </div>
//                                                                 </div>
//                                                             ))}
//                                                         </div>
//                                                     )}
//                                                 </div>
//                                             </div>
//                                         </div>
//                                     )}
//                                 </div>
//                             </div>
//                         </Card>
//
//                         {/* Résultats */}
//                         {result.length > 0 && (
//                             <Card className="border-0 shadow-sm">
//                                 <div className="card-body">
//                                     <div className="d-flex justify-content-between align-items-center mb-3">
//                                         <h3 className="card-title mb-0">Résultats de votre recherche</h3>
//                                         <span className="badge bg-success fs-6">{result.length} enregistrement(s)</span>
//                                     </div>
//                                     <DataTable
//                                         value={result}
//                                         paginator
//                                         rows={10}
//                                         rowsPerPageOptions={[5, 10, 20]}
//                                         tableStyle={{ minWidth: '50rem' }}
//                                         scrollable
//                                         scrollHeight="400px"
//                                         className="results-table"
//                                     >
//                                         {columns.map(col => (
//                                             <Column
//                                                 key={col.field}
//                                                 field={col.field}
//                                                 header={col.header}
//                                                 sortable
//                                                 style={{ minWidth: '150px' }}
//                                             />
//                                         ))}
//                                     </DataTable>
//                                 </div>
//                             </Card>
//                         )}
//                     </div>
//                 ) : (
//                     /* Page d'accueil */
//                     <div className="container-fluid py-5">
//                         <div className="row justify-content-center">
//                             <div className="col-lg-8">
//                                 <Card className="border-0 shadow text-center">
//                                     <div className="card-body py-5">
//                                         <i className="pi pi-chart-line text-primary mb-4" style={{ fontSize: '4rem' }}></i>
//                                         <h2 className="card-title mb-3">Bienvenue dans l'Assistant de Requêtes</h2>
//                                         <p className="card-text text-muted mb-4 fs-5">
//                                             Cet outil vous permet d'extraire des données sans aucune connaissance technique.<br />
//                                             Sélectionnez simplement une base de données pour commencer.
//                                         </p>
//                                         <div className="row g-4 mt-4">
//                                             <div className="col-md-3">
//                                                 <div className="text-center">
//                                                     <i className="pi pi-mouse text-primary mb-2" style={{ fontSize: '2rem' }}></i>
//                                                     <h6>Interface 100% visuelle</h6>
//                                                 </div>
//                                             </div>
//                                             <div className="col-md-3">
//                                                 <div className="text-center">
//                                                     <i className="pi pi-th-large text-primary mb-2" style={{ fontSize: '2rem' }}></i>
//                                                     <h6>Sélection par clics</h6>
//                                                 </div>
//                                             </div>
//                                             <div className="col-md-3">
//                                                 <div className="text-center">
//                                                     <i className="pi pi-filter text-primary mb-2" style={{ fontSize: '2rem' }}></i>
//                                                     <h6>Filtres intuitifs</h6>
//                                                 </div>
//                                             </div>
//                                             <div className="col-md-3">
//                                                 <div className="text-center">
//                                                     <i className="pi pi-sort-alt text-primary mb-2" style={{ fontSize: '2rem' }}></i>
//                                                     <h6>Tri facile</h6>
//                                                 </div>
//                                             </div>
//                                         </div>
//                                     </div>
//                                 </Card>
//                             </div>
//                         </div>
//                     </div>
//                 )}
//             </main>
//
//             {/* Dialogues Bootstrap */}
//             <Dialog header="Choisir une table" visible={showTableDialog}
//                     style={{ width: '600px' }} onHide={() => setShowTableDialog(false)}>
//                 <div className="row g-3">
//                     {Object.entries(BUSINESS_DATABASES[selectedDb]?.tables || {}).map(([key, table]) => (
//                         <div key={key} className="col-12">
//                             <div className="card hover-shadow cursor-pointer" onClick={() => handleTableSelect(key)}>
//                                 <div className="card-body">
//                                     <div className="d-flex align-items-start">
//                                         <i className="pi pi-table text-primary me-3 mt-1 fs-5"></i>
//                                         <div className="flex-grow-1">
//                                             <h6 className="card-title mb-1">{table.name}</h6>
//                                             <p className="card-text text-muted mb-1">{table.description}</p>
//                                             <small className="text-muted">{table.fields.length} colonnes disponibles</small>
//                                         </div>
//                                     </div>
//                                 </div>
//                             </div>
//                         </div>
//                     ))}
//                 </div>
//             </Dialog>
//
//             <Dialog header="Ajouter un filtre" visible={showFilterDialog}
//                     style={{ width: '500px' }} onHide={() => setShowFilterDialog(false)}>
//                 <div className="row g-3">
//                     <div className="col-12">
//                         <label className="form-label">Colonne</label>
//                         <Dropdown
//                             value={currentFilter.field}
//                             onChange={(e) => setCurrentFilter({...currentFilter, field: e.value})}
//                             options={BUSINESS_DATABASES[selectedDb]?.tables[selectedTable]?.fields.map(f => ({
//                                 label: f.label,
//                                 value: f.name
//                             }))}
//                             placeholder="Choisir une colonne..."
//                             className="w-100"
//                         />
//                     </div>
//                     <div className="col-12">
//                         <label className="form-label">Opérateur</label>
//                         <Dropdown
//                             value={currentFilter.operator}
//                             onChange={(e) => setCurrentFilter({...currentFilter, operator: e.value})}
//                             options={[
//                                 { label: "Égal à (=)", value: "=" },
//                                 { label: "Différent de (!=)", value: "!=" },
//                                 { label: "Supérieur à (>)", value: ">" },
//                                 { label: "Inférieur à (<)", value: "<" },
//                                 { label: "Supérieur ou égal (>=)", value: ">=" },
//                                 { label: "Inférieur ou égal (<=)", value: "<=" },
//                                 { label: "Contient", value: "contient" }
//                             ]}
//                             className="w-100"
//                         />
//                     </div>
//                     <div className="col-12">
//                         <label className="form-label">Valeur</label>
//                         <InputText
//                             value={currentFilter.value}
//                             onChange={(e) => setCurrentFilter({...currentFilter, value: e.target.value})}
//                             placeholder="Saisir la valeur..."
//                             className="w-100"
//                         />
//                     </div>
//                 </div>
//                 <div className="d-flex justify-content-end gap-2 mt-4">
//                     <button className="btn btn-outline-secondary" onClick={() => setShowFilterDialog(false)}>
//                         <i className="pi pi-times me-2"></i>
//                         Annuler
//                     </button>
//                     <button className="btn btn-primary" onClick={addFilter}>
//                         <i className="pi pi-check me-2"></i>
//                         Ajouter
//                     </button>
//                 </div>
//             </Dialog>
//
//             <Dialog header="Trier les résultats" visible={showSortDialog}
//                     style={{ width: '500px' }} onHide={() => setShowSortDialog(false)}>
//                 <div className="row g-3">
//                     <div className="col-12">
//                         <label className="form-label">Colonne à trier</label>
//                         <Dropdown
//                             value={currentSort.field}
//                             onChange={(e) => setCurrentSort({...currentSort, field: e.value})}
//                             options={BUSINESS_DATABASES[selectedDb]?.tables[selectedTable]?.fields.map(f => ({
//                                 label: f.label,
//                                 value: f.name
//                             }))}
//                             placeholder="Choisir une colonne..."
//                             className="w-100"
//                         />
//                     </div>
//                     <div className="col-12">
//                         <label className="form-label">Ordre de tri</label>
//                         <div className="d-flex gap-4">
//                             <div className="form-check">
//                                 <RadioButton
//                                     inputId="sort_asc"
//                                     name="sort_direction"
//                                     value="ASC"
//                                     onChange={(e) => setCurrentSort({...currentSort, direction: e.value})}
//                                     checked={currentSort.direction === "ASC"}
//                                 />
//                                 <label htmlFor="sort_asc" className="form-check-label ms-2">Croissant (A-Z, 0-9)</label>
//                             </div>
//                             <div className="form-check">
//                                 <RadioButton
//                                     inputId="sort_desc"
//                                     name="sort_direction"
//                                     value="DESC"
//                                     onChange={(e) => setCurrentSort({...currentSort, direction: e.value})}
//                                     checked={currentSort.direction === "DESC"}
//                                 />
//                                 <label htmlFor="sort_desc" className="form-check-label ms-2">Décroissant (Z-A, 9-0)</label>
//                             </div>
//                         </div>
//                     </div>
//                 </div>
//                 <div className="d-flex justify-content-end gap-2 mt-4">
//                     <button className="btn btn-outline-secondary" onClick={() => setShowSortDialog(false)}>
//                         <i className="pi pi-times me-2"></i>
//                         Annuler
//                     </button>
//                     <button className="btn btn-primary" onClick={addSort}>
//                         <i className="pi pi-check me-2"></i>
//                         Ajouter
//                     </button>
//                 </div>
//             </Dialog>
//
//             {/* Dialogue de sauvegarde de requête */}
//             <Dialog header="Sauvegarder la requête" visible={showSaveQueryDialog}
//                     style={{ width: '500px' }} onHide={() => setShowSaveQueryDialog(false)}>
//                 <div className="p-fluid">
//                     <div className="field">
//                         <label htmlFor="queryName" className="form-label">Nom de la requête</label>
//                         <InputText
//                             id="queryName"
//                             value={queryName}
//                             onChange={(e) => setQueryName(e.target.value)}
//                             placeholder="Donnez un nom à votre requête..."
//                             className="w-100"
//                         />
//                         <small className="text-muted">
//                             Exemples: "Écritures validées", "Clients Grands Comptes", "Commandes en cours"
//                         </small>
//                     </div>
//                     <div className="mt-3 p-3 bg-light rounded">
//                         <small>
//                             <strong>Cette requête contient :</strong><br/>
//                             • Table: {BUSINESS_DATABASES[selectedDb]?.tables[selectedTable]?.name}<br/>
//                             • Colonnes: {selectedColumns.length} sélectionnée(s)<br/>
//                             • Filtres: {filters.length} appliqué(s)<br/>
//                             • Tris: {sorting.length} appliqué(s)
//                         </small>
//                     </div>
//                 </div>
//                 <div className="d-flex justify-content-end gap-2 mt-4">
//                     <button className="btn btn-outline-secondary" onClick={() => setShowSaveQueryDialog(false)}>
//                         <i className="pi pi-times me-2"></i>
//                         Annuler
//                     </button>
//                     <button className="btn btn-primary" onClick={confirmSaveQuery}>
//                         <i className="pi pi-save me-2"></i>
//                         Sauvegarder
//                     </button>
//                 </div>
//             </Dialog>
//
//             {/* Dialogue de chargement des requêtes sauvegardées */}
//             <Dialog header="Mes requêtes sauvegardées" visible={showLoadQueryDialog}
//                     style={{ width: '600px' }} onHide={() => setShowLoadQueryDialog(false)}>
//                 {savedQueries.length === 0 ? (
//                     <div className="text-center py-4">
//                         <i className="pi pi-inbox fs-1 text-muted mb-3 d-block"></i>
//                         <p className="text-muted">Aucune requête sauvegardée</p>
//                         <small>Créez et sauvegardez vos premières requêtes pour les retrouver ici</small>
//                     </div>
//                 ) : (
//                     <div className="row g-3">
//                         {savedQueries.map(query => (
//                             <div key={query.id} className="col-12">
//                                 <div
//                                     className="card hover-shadow cursor-pointer"
//                                     onClick={() => loadSavedQuery(query)}
//                                 >
//                                     <div className="card-body">
//                                         <div className="d-flex justify-content-between align-items-start">
//                                             <div className="flex-grow-1">
//                                                 <h6 className="card-title mb-1">{query.name}</h6>
//                                                 <p className="card-text text-muted mb-1 small">
//                                                     {BUSINESS_DATABASES[query.database]?.name} → {BUSINESS_DATABASES[query.database]?.tables[query.table]?.name}
//                                                 </p>
//                                                 <div className="small text-muted">
//                                                     <span className="me-3">📊 {query.columns.length} colonnes</span>
//                                                     <span className="me-3">🔍 {query.filters.length} filtres</span>
//                                                     <span>📈 {query.sorting.length} tris</span>
//                                                 </div>
//                                                 <small className="text-muted">
//                                                     Créée le {new Date(query.createdAt).toLocaleDateString()}
//                                                 </small>
//                                             </div>
//                                             <button
//                                                 className="btn btn-sm btn-outline-danger"
//                                                 onClick={(e) => deleteSavedQuery(query.id, e)}
//                                             >
//                                                 <i className="pi pi-trash"></i>
//                                             </button>
//                                         </div>
//                                     </div>
//                                 </div>
//                             </div>
//                         ))}
//                     </div>
//                 )}
//             </Dialog>
//         </div>
//     );
// }