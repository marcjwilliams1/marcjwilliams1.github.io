// Muller (fish) plot of clonal evolution, simulated fresh on each page load.
//
// Model: a founder clone plus 6–8 subclones. Each subclone arises inside a
// parent at a random time, starting at ~0.7% of the parent's size, and grows
// exponentially at its own rate. Clone frequencies are the normalised sizes;
// total tumour burden follows logistic growth from a single cell.
(function () {
    var svg = document.getElementById('muller');
    if (!svg) return;

    var NS = 'http://www.w3.org/2000/svg';
    var T = 260;                       // time steps across the plot
    var FOUNDER_RATE = 0.05;           // founder growth rate per step
    var COLOURS = ['#F7D9E3', '#EFB3C9', '#E28DB2', '#D07CAE', '#B76AAC', '#9A5BA8', '#7A4FA2', '#5A4596', '#372F73'];
    var clones, F, H;

    // Selective advantage of a new subclone over its parent, added to the
    // parent's growth rate: the distribution of fitness effects (DFE).
    //
    // Some clones are neutral passengers. They persist as a thin sliver
    // inside their parent but never expand. The rest are drivers whose
    // effects are exponentially distributed (extreme-value theory: beneficial
    // effects sit in the tail of the fitness distribution, so most are modest
    // and a few are large). The floor keeps drivers visible: a clone starts
    // e^-5 times smaller than its parent, so it needs roughly 5 / (T - birth)
    // to emerge before the plot ends. The cap stops one extreme draw from
    // sweeping everything else away in a few steps.
    //
    // Tuned over 1,500 simulations: ~4 subclones reach 3% frequency on
    // average, and ~14% of runs show two or fewer.
    var PASSENGER_FRACTION = 0.15;
    var DRIVER_FLOOR = 0.04;
    var DRIVER_MEAN = 0.025;           // mean effect above the floor
    var DRIVER_CAP = 0.10;

    function selectiveAdvantage() {
        if (Math.random() < PASSENGER_FRACTION) return 0;
        var s = DRIVER_FLOOR - DRIVER_MEAN * Math.log(1 - Math.random());
        return Math.min(s, DRIVER_CAP);
    }

    function simulate() {
        var n = 6 + Math.floor(Math.random() * 3);
        var births = [];
        for (var i = 0; i < n; i++) births.push(Math.floor(T * (0.1 + 0.55 * Math.random())));
        births.sort(function (a, b) { return a - b; });

        clones = [{ parent: -1, birth: 0, s: FOUNDER_RATE, logInit: 0, children: [] }];
        births.forEach(function (b) {
            var eligible = clones.filter(function (c) { return c.birth < b - 10; });
            var p = eligible[Math.floor(Math.random() * eligible.length)];
            clones.push({
                parent: clones.indexOf(p),
                birth: b,
                s: p.s + selectiveAdvantage(),
                logInit: p.logInit + p.s * (b - p.birth) - 5,
                children: []
            });
            p.children.push(clones.length - 1);
        });

        // Inclusive frequency (clone plus descendants) at each time step.
        F = clones.map(function () { return new Float64Array(T + 1); });
        for (var t = 0; t <= T; t++) {
            var logs = clones.map(function (c) { return t >= c.birth ? c.logInit + c.s * (t - c.birth) : -Infinity; });
            var m = Math.max.apply(null, logs);
            var w = logs.map(function (l) { return Math.exp(l - m); });
            var sum = w.reduce(function (a, b) { return a + b; }, 0);
            for (var k = clones.length - 1; k >= 0; k--) {
                F[k][t] += w[k] / sum;
                if (clones[k].parent >= 0) F[clones[k].parent][t] += F[k][t];
            }
        }

        // Tumour burden, rescaled so it starts at exactly zero.
        var h0 = 1 / (1 + Math.exp(4));
        H = new Float64Array(T + 1);
        for (var t2 = 0; t2 <= T; t2++) {
            var h = 1 / (1 + Math.exp(-(t2 - 0.2 * T) / (0.05 * T)));
            H[t2] = Math.max(0, (h - h0) / (1 - h0));
        }
    }

    function draw() {
        var W = svg.clientWidth, Hpx = svg.clientHeight;
        if (!W || !Hpx) return;
        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Hpx);
        while (svg.firstChild) svg.removeChild(svg.firstChild);

        // Initiation point lines up with the left edge of the text column.
        var main = document.querySelector('main');
        var x0 = 0;
        if (main) {
            x0 = main.getBoundingClientRect().left - svg.getBoundingClientRect().left +
                 (parseFloat(getComputedStyle(main).paddingLeft) || 0);
            x0 = Math.max(0, x0);
        }
        function x(t) { return x0 + (W - x0) * t / T; }

        // Band [lo, hi] for every clone at every time. Children sit inside
        // their parent with equal gaps around them, so a newborn clone appears
        // as a point in its slot without nudging its siblings.
        var lo = clones.map(function () { return new Float64Array(T + 1); });
        var hi = clones.map(function () { return new Float64Array(T + 1); });
        for (var t = 0; t <= T; t++) {
            var half = H[t] * Hpx * 0.48;
            lo[0][t] = Hpx / 2 - half;
            hi[0][t] = Hpx / 2 + half;
            (function place(k) {
                var kids = clones[k].children;
                if (!kids.length) return;
                var h = hi[k][t] - lo[k][t];
                var hs = kids.map(function (c) { return F[k][t] > 0 ? h * F[c][t] / F[k][t] : 0; });
                var gap = (h - hs.reduce(function (a, b) { return a + b; }, 0)) / (kids.length + 1);
                var y = lo[k][t] + gap;
                kids.forEach(function (c, j) {
                    lo[c][t] = y;
                    hi[c][t] = y + hs[j];
                    y += hs[j] + gap;
                    place(c);
                });
            })(0);
        }

        clones.forEach(function (c, k) {
            var top = [], bottom = [];
            for (var t = c.birth; t <= T; t++) {
                top.push(x(t).toFixed(1) + ',' + lo[k][t].toFixed(1));
                bottom.unshift(x(t).toFixed(1) + ',' + hi[k][t].toFixed(1));
            }
            var p = document.createElementNS(NS, 'path');
            p.setAttribute('d', 'M' + top.concat(bottom).join('L') + 'Z');
            p.setAttribute('fill', COLOURS[Math.min(k, COLOURS.length - 1)]);
            p.setAttribute('stroke', '#FDFCFD');
            p.setAttribute('stroke-width', '0.8');
            svg.appendChild(p);
        });
    }

    function run() {
        simulate();
        draw();
        // Restart the left-to-right reveal.
        var plot = svg.parentNode;
        plot.classList.remove('reveal');
        void plot.offsetWidth;
        plot.classList.add('reveal');
    }

    run();

    var rerun = document.getElementById('rerun');
    if (rerun) rerun.addEventListener('click', run);

    var timer;
    window.addEventListener('resize', function () {
        clearTimeout(timer);
        timer = setTimeout(draw, 120);
    });
})();
