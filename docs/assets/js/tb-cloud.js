/* ============================================================
   DevOps Toolbox - Cloud / AWS category
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var TB = window.TB;
  if (!TB) return;

  TB.wireOutputButtons();
  TB.wireAccordions();





  /* ============================================================
     2. IAM policy generator
     ============================================================ */
  (function () {
    if (!$('ci-actions')) return;

  var IAM_ACTIONS = {
    s3: ['GetObject', 'PutObject', 'DeleteObject', 'ListBucket', 'GetBucketLocation',
         'ListAllMyBuckets', 'AbortMultipartUpload'],
    dynamodb: ['GetItem', 'PutItem', 'DeleteItem', 'Query', 'Scan', 'UpdateItem',
               'BatchGetItem', 'BatchWriteItem', 'DescribeTable', 'ListTables'],
    ec2: ['DescribeInstances', 'RunInstances', 'StartInstances', 'StopInstances',
          'TerminateInstances', 'CreateTags', 'DescribeImages', 'DescribeSecurityGroups'],
    sqs: ['SendMessage', 'ReceiveMessage', 'DeleteMessage', 'GetQueueAttributes',
          'GetQueueUrl', 'ListQueues'],
    sns: ['Publish', 'Subscribe', 'Unsubscribe', 'ListSubscriptions', 'ListTopics'],
    lambda: ['InvokeFunction', 'GetFunction', 'UpdateFunctionCode', 'ListFunctions'],
    logs: ['GetLogEvents', 'FilterLogEvents', 'CreateLogGroup', 'CreateLogStream',
           'PutLogEvents', 'DescribeLogStreams']
  };

  function renderPolicy() {
    var svc = $('ci-service').value;
    var effect = $('ci-effect').value;
    var acts = $('ci-actions').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var res = [$('ci-resource').value.trim() || '*'];

    var stmt = {
      Effect: effect,
      Action: acts.map(function (a) {
        if (a.indexOf(':') !== -1) return a;             /* already namespaced */
        return svc + ':' + a.replace(/^([a-z])/, function (m) { return m.toUpperCase(); });
      }),
      Resource: res
    };
    var policy = { Version: '2012-10-17', Statement: [stmt] };
    $('ci-out').innerHTML = TB.highlight(JSON.stringify(policy, null, 2), 'json');
  }
  ['ci-service', 'ci-effect', 'ci-actions', 'ci-resource'].forEach(function (id) {
    $(id).addEventListener('input', renderPolicy);
  });
  $('ci-service').addEventListener('change', function () {
    var svc = $('ci-service').value;
    $('ci-resource').value =
      svc === 's3' ? 'arn:aws:s3:::my-bucket/*' :
      svc === 'dynamodb' ? 'arn:aws:dynamodb:us-east-1:123456789012:table/MyTable' :
      svc === 'ec2' ? '*' :
      svc === 'sqs' ? 'arn:aws:sqs:us-east-1:123456789012:my-queue' :
      svc === 'sns' ? 'arn:aws:sns:us-east-1:123456789012:my-topic' :
      svc === 'lambda' ? 'arn:aws:lambda:us-east-1:123456789012:function:my-fn' :
        'arn:aws:logs:*:*:*';
    renderPolicy();
  });
  renderPolicy();
  })();


  /* ============================================================
     3. ARN builder & parser
     ============================================================ */
  (function () {
    if (!$('ca-parse')) return;

  function parseArn(arn) {
    var m = arn.match(/^arn:(\w[\w-]*):(\w[\w-]*):([^:]*):([^:]*):(.+)$/);
    if (!m) throw new Error('not a valid ARN - expected arn:partition:service:region:account:resource');
    var rest = m[5];
    var out = {
      partition: m[1], service: m[2], region: m[3] || '(global)', account: m[4] || '(none)'
    };
    /* resource-type/resource-id splitting */
    var slash = rest.indexOf('/');
    var colonIdx = rest.indexOf(':');
    if (slash !== -1) {
      out['resource type'] = rest.slice(0, slash).replace(/^(arn|)/, '');
      out['resource id'] = rest.slice(slash + 1);
    } else if (colonIdx !== -1) {
      out['resource type'] = rest.slice(0, colonIdx);
      out['resource id'] = rest.slice(colonIdx + 1);
    } else {
      out['resource'] = rest;
    }
    return out;
  }

  $('ca-parse').addEventListener('input', function () {
    var errEl = $('ca-error'), kvEl = $('ca-kv');
    errEl.hidden = true;
    try {
      var p = parseArn($('ca-parse').value.trim());
      kvEl.hidden = false;
      TB.fillKv(kvEl, Object.keys(p).map(function (k) { return [k, p[k]]; }));
    } catch (e) {
      kvEl.hidden = true;
      errEl.textContent = e.message; errEl.hidden = false;
    }
  });

  function renderArnBuild() {
    var built = 'arn:' + $('cb-partition').value + ':' +
      $('cb-service').value.trim() + ':' +
      $('cb-region').value.trim() + ':' +
      $('cb-account').value.trim() + ':' +
      $('cb-resource').value.trim();
    $('cb-built').value = built;
  }
  ['cb-partition', 'cb-service', 'cb-region', 'cb-account', 'cb-resource'].forEach(function (id) {
    $(id).addEventListener('input', renderArnBuild);
  });
  renderArnBuild();

  /* prime the parser with the default value */
  $('ca-parse').dispatchEvent(new Event('input'));
  })();


  /* ============================================================
     4. cloud-init user-data generator
     ============================================================ */
  (function () {
    if (!$('cc-hostname')) return;

  function renderCloudInit() {
    var cfg = {};
    var hn = $('cc-hostname').value.trim();
    if (hn) cfg.hostname = hn;
    var pkgs = $('cc-packages').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (pkgs.length) cfg.packages = pkgs;
    var key = $('cc-sshkey').value.trim();
    if (key) cfg.ssh_authorized_keys = [key];
    var cmds = $('cc-runcmd').value.split('\n').map(function (s) { return s.trim(); })
      .filter(function (s) { return s && !s.startsWith('#'); });
    if (cmds.length) cfg.runcmd = cmds;
    cfg.final_message = 'cloud-init completed in $UPTIME seconds';

    $('cc-out').innerHTML = TB.highlight('#cloud-config\n' + TB.toYaml(cfg), 'yaml');
  }
  ['cc-hostname', 'cc-packages', 'cc-sshkey'].forEach(function (id) {
    $(id).addEventListener('input', renderCloudInit);
  });
  $('cc-runcmd').addEventListener('input', renderCloudInit);
  renderCloudInit();
  })();

})();
