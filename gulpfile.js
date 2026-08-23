const gulp = require('gulp');
const sass = require('gulp-sass');
const sourceMaps = require('gulp-sourcemaps');
const autoprefixer = require('gulp-autoprefixer');
const browserSync = require('browser-sync');
const del = require('del');

//SCSS compilation

function styleMain() {
    return gulp.src('./src/scss/*.scss')
        .pipe(sourceMaps.init())
        .pipe(sass().on('error', sass.logError))
        .pipe(autoprefixer())
        .pipe(sourceMaps.write('./'))
        .pipe(gulp.dest('./src/css'))
        .pipe(browserSync.stream());
}

function styleDemo() {
    return gulp.src('./docs/assets/scss/*.scss')
        .pipe(sourceMaps.init())
        .pipe(sass().on('error', sass.logError))
        .pipe(autoprefixer())
        .pipe(sourceMaps.write('./'))
        .pipe(gulp.dest('./docs/assets/css'))
        .pipe(browserSync.stream());
}

function watch() {
    browserSync.init({
        server: {
            baseDir: './',
        },
        startPath: './docs/index.html',
        ghostMode: false,
        notify: false
    });
    gulp.watch('./src/scss/**/*.scss', styleMain);
    gulp.watch('./docs/assets/scss/**/*.scss', styleDemo);
    gulp.watch('./**/*.html').on('change', browserSync.reload);
    gulp.watch('./assets/js/**/*.js').on('change', browserSync.reload);
}

function cleanVendors() {
    return del('./assets/vendors/**/*');
}

function copyBootstrap() {
    return gulp.src('./node_modules/bootstrap/**/*')
        .pipe(gulp.dest('./assets/vendors/bootstrap'));
}

function copyMdi() {
    return gulp.src('./node_modules/@mdi/**/*')
        .pipe(gulp.dest('./assets/vendors/@mdi'));
}

function copyJquery() {
    return gulp.src('./node_modules/jquery/**/*')
        .pipe(gulp.dest('./assets/vendors/jquery'));
}

function copyPopper() {
    return gulp.src('./node_modules/popper.js/**/*')
        .pipe(gulp.dest('./assets/vendors/popper.js'));
}

exports.style = gulp.parallel(styleMain, styleDemo);
exports.watch = watch;
exports.cleanVendors = cleanVendors;
exports.buildAddonVendors = gulp.series(cleanVendors, gulp.parallel(copyBootstrap, copyMdi, copyJquery, copyPopper));
