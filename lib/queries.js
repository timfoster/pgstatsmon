var mod_ajv = require('ajv');

/*
 * queries.js: a list of queries to be executed by pgstatsmon to collect
 * metrics.
 *
 * Each object in the query array contains a number of required fields:
 *
 *    queries          array of query objects
 *
 *        name         human-readable name of the resulting metric
 *
 *        sql          sql statement string that will be executed on each
 *                     Postgres instance
 *
 *        statkey      unique per-row attribute name that pgstatsmon will use as
 *                     an index to store metrics in memory
 *
 *        metadata     array of attribute names to be used as metadata labels in
 *                     the resulting metric
 *
 *        counters     array of counter objects. Each counter object tracks the
 *                     value of the provided attribute from the sql result set.
 *                     Counters are used to represent things that only move up,
 *                     like bytes written or vacuum counts.
 *
 *            attr     attribute name from the sql result set. Used to find the
 *                     value of the metric.
 *
 *            help     human-readable string to assist in understanding what a
 *                     metric represents
 *
 *            unit     [optional] unit by which the metric should be measured
 *                     (e.g. 'ms' for 'milliseconds')
 *
 *        gauges       array of gauge objects. Each gauge object tracks the
 *                     value of the provided attribute from teh sql result set.
 *                     Gauges are used to represent things that can move up or
 *                     down, like connection counts and table sizes.
 *
 *            attr     attribute name from the sql result set. Used to find the
 *                     value of the metric.
 *
 *            help     human-readable string to assist in understanding what a
 *                     metric represents
 *
 *            unit     [optional] unit by which the metric should be measured
 *                     (e.g. 'ms' for 'milliseconds')
 *
 *
 * The query schema is validated when pgstatsmon starts.
 */

var queries = [ {
    'name': 'pg_stat_user_tables',
    'sql': 'SELECT * FROM pg_stat_user_tables',
    'statkey': 'relname',
    'metadata': [ 'relname' ],
    'counters': [
	{ 'attr': 'analyze_count', 'help': 'manual anaylze operations' },
	{ 'attr': 'autoanalyze_count', 'help': 'autoanalyze operations' },
	{ 'attr': 'autovacuum_count', 'help': 'autovacuum operations' },
	{ 'attr': 'idx_scan', 'help': 'index scans' },
	{ 'attr': 'idx_tup_fetch', 'help': 'index tuples fetched' },
	{ 'attr': 'n_tup_del', 'help': 'tuples deleted' },
	{ 'attr': 'n_tup_hot_upd', 'help': 'tuples updated (hot)' },
	{ 'attr': 'n_tup_ins', 'help': 'tuples inserted' },
	{ 'attr': 'n_tup_upd', 'help': 'tuples updated' },
	{ 'attr': 'seq_scan', 'help': 'sequential table scans' },
	{ 'attr': 'seq_tup_read', 'help': 'sequential tuples read' },
	{ 'attr': 'vacuum_count', 'help': 'manual vacuum operations' }
    ],
    'gauges': [
	{ 'attr': 'n_live_tup', 'help': 'estimated live tuples' },
	{ 'attr': 'n_dead_tup', 'help': 'estimated dead tuples' }
    ]
}, {
    'name': 'pg_stat_replication',
    'statkey': 'application_name',
    'metadata': [ 'sync_state' ],
    'sql': [
	'SELECT ',
	'sync_state, ',
	'pg_xlog_location_diff(sent_location, write_location) AS write_lag, ',
	'pg_xlog_location_diff(write_location, flush_location) AS flush_lag, ',
	'pg_xlog_location_diff(flush_location, replay_location) AS replay_lag',
	'FROM pg_stat_replication'
    ].join('\n'),
    'gauges': [
	{ 'attr': 'write_lag', 'help': 'write lag', 'unit': 'bytes' },
	{ 'attr': 'flush_lag', 'help': 'flush lag', 'unit': 'bytes' },
	{ 'attr': 'replay_lag', 'help': 'replay lag', 'unit': 'bytes' }
    ]
}, {
    'name': 'pg_class',
    'statkey': 'relname',
    'metadata': [ 'relname' ],
    'sql': [
	'SELECT c.oid::regclass AS relname,',
	'       greatest(age(c.relfrozenxid),age(t.relfrozenxid)) AS freezeage',
	'FROM pg_class c',
	'LEFT JOIN pg_class t ON c.reltoastrelid = t.oid',
	'WHERE c.relkind = \'r\';'
    ].join('\n'),
    'gauges': [ { 'attr': 'freezeage', 'help': 'xids since last vacuum' } ]
}, {
    'name': 'pg_stat_activity',
    'statkey': 'datname',
    'metadata': [ 'datname', 'state' ],
    'sql': [
	'SELECT datname, state, count(*) AS connections',
	'FROM pg_stat_activity',
	'GROUP BY datname, state;'
    ].join('\n'),
    'gauges': [ { 'attr': 'connections', 'help': 'worker process state' } ]
}, {
    'name': 'pg_stat_database',
    'statkey': 'datname',
    'metadata': [ 'datname' ],
    'sql': [
	'SELECT *',
	'FROM pg_stat_database'
    ].join('\n'),
    'gauges': [ { 'attr': 'numbackends', 'help': 'number of connections' } ],
    'counters': [
	{ 'attr': 'tup_returned', 'help': 'tuples returned' },
	{ 'attr': 'tup_fetched', 'help': 'tuples fetched' },
	{ 'attr': 'tup_inserted', 'help': 'tuples inserted' },
	{ 'attr': 'tup_updated', 'help': 'tuples updated' },
	{ 'attr': 'tup_deleted', 'help': 'tuples deleted' },
	{ 'attr': 'blks_read', 'help': 'blocks read from disk' },
	{ 'attr': 'blks_hit', 'help': 'blocks read from buffercache' },
	{ 'attr': 'xact_commit', 'help': 'transactions committed' },
	{ 'attr': 'xact_rollback', 'help': 'transactions rolled back' },
	{ 'attr': 'blk_read_time', 'help': 'time spent reading blocks',
	    'unit': 'ms' },
	{ 'attr': 'blk_write_time', 'help': 'time spent writing blocks',
	    'unit': 'ms' }
    ]
}, {
    'name': 'pg_relation_size',
    'statkey': 'relname',
    'metadata': [ 'relname' ],
    'sql': [
	'SELECT relname, ',
	'       c.reltuples AS row_estimate,',
	'       pg_total_relation_size(c.oid) AS total_bytes,',
	'       pg_indexes_size(c.oid) AS index_bytes,',
	'       pg_total_relation_size(reltoastrelid) AS toast_bytes',
	'FROM pg_class c',
	'LEFT JOIN pg_namespace n ON n.oid = c.relnamespace',
	'WHERE relkind = \'r\' AND nspname LIKE \'public\';'
    ].join('\n'),
    'gauges': [
	{ 'attr': 'row_estimate', 'help': 'estimated number of tuples' },
	{ 'attr': 'total_bytes', 'help': 'total bytes used' },
	{ 'attr': 'index_bytes', 'help': 'bytes used by indexes' },
	{ 'attr': 'toast_bytes', 'help': 'bytes used by toast files' }
    ]
}, {
    'name': 'pg_stat_bgwriter',
    'statkey': 'bgwriter',
    'metadata': [],
    'sql': [
	'SELECT *',
	'FROM pg_stat_bgwriter;'
    ].join('\n'),
    'counters': [
	{ 'attr': 'checkpoints_timed', 'help': 'scheduled checkpoints' },
	{ 'attr': 'checkpoints_req', 'help': 'requested checkpoints' },
	{ 'attr': 'checkpoint_write_time', 'help': 'time spent writing' +
	    ' checkpoints to disk', 'unit': 'ms' },
	{ 'attr': 'checkpoint_sync_time', 'help': 'time spent synchronizing' +
	    ' checkpoints to disk', 'unit': 'ms' },
	{ 'attr': 'buffers_checkpoint', 'help': 'buffers written during' +
	    ' checkpoints' },
	{ 'attr': 'buffers_clean', 'help': 'buffers written by bgwriter' },
	{ 'attr': 'maxwritten_clean', 'help': 'number of times bgwriter' +
	    ' stopped a cleaning scan because too many buffers were written' },
	{ 'attr': 'buffers_backend', 'help': 'buffers written by a backend' },
	{ 'attr': 'buffers_backend_fsync', 'help': 'number of fsync calls by' +
	    ' backends' },
	{ 'attr': 'buffers_alloc', 'help': 'number of buffers allocated' }
    ]
} ];

/*
 * Validate the query schema. Returns the query object if valid.
 */
function getQueries()
{
	var ajv = new mod_ajv();
	var metric = {
		'type': 'object',
		'properties': {
			'attr': { 'type': 'string' },
			'help': { 'type': 'string' },
			'unit': { 'type': 'string' }
		},
		'required': [ 'attr', 'help' ]
	};
	var query = {
		'type': 'object',
		'properties': {
			'name': { 'type': 'string' },
			'sql': { 'type': 'string' },
			'statkey': { 'type': 'string' },
			'metadata': { 'type': 'array',
			    'items': { 'type': 'string' } },
			'counters': { 'type': 'array',
			    'items': metric },
			'gauges': { 'type': 'array',
			    'items': metric }
		},
		'required': [ 'name', 'sql', 'statkey' ]
	};
	var queryArray = {
		'type': 'array',
		'items': query
	};

	/* check the 'query' object against the queryArray schema */
	if (ajv.validate(queryArray, queries)) {
		return (queries);
	}
	/* if validation fails, try to print a decent message */
	throw new Error(JSON.stringify(ajv.errors, null, 4));
}

module.exports.getQueries = getQueries;