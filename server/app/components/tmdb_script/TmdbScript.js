'use strict';

/**
 * MIT License
 * Copyright (c) 2017 Dimitar Andreev
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 * 
 * modified by Ray Andrew (http://github.com/ironlota)
 * to get omdb data and update data in database
 */

const EventEmitter = require('events');
// const readline = require('readline');
const mongoose = require('mongoose');
const bluebird = require('bluebird');
mongoose.Promise = bluebird.Promise;
const steed = require('steed')();
const SteedState = require('./SteedState');
const Logger = require('../../components/winston');
const thisMonth = require('../month');

const {
    QUERY_TIMEOUT,
    EVENTS,
    POOL_SIZE,
    REQUESTS_PER_TICK,
    TICK_TIMEOUT,
    // AFFIRMATIVE_ANSWER,
    // SEPARATOR_SYMBOL,
    // SEPARATOR_SYMBOLS_COUNT,
    STEP
} = require('./Constants');

const TmdbApi = require('./TmdbApi_request');
const movieMongoose = require('../../models/movieSchema');
const personMongoose = require('../../models/personSchema');
const config = require('config');

module.exports = {
  start: (step, transferData) => {
    const API_TMDB_KEY = config.get('tmdb')['api_key'];
    const API_OMDB_KEY = config.get('omdb')['api_key'];
        // const LINE_SEPARATOR = SEPARATOR_SYMBOL.repeat(SEPARATOR_SYMBOLS_COUNT);
    const opts = {
      server: {
        socketOptions: {
          keepAlive: QUERY_TIMEOUT,
          connectTimeoutMS: QUERY_TIMEOUT
        },
        poolSize: POOL_SIZE
      },
      replset: {
        socketOptions: {
          keepAlive: QUERY_TIMEOUT,
          connectTimeoutMS: QUERY_TIMEOUT
        }
      }
    };

    const handleError = (err) => {
      if (err) {
        Logger.error('Something bad happened', err);
                // process.exit();
      }
    };

    mongoose.connect(config.get('mongodb')['url'], opts).then(
            () => {
              Logger.verbose('Connect successfully with MongoDB');
            },
            (err) => {
              Logger.error(err);
            }
        );
    const Movie = movieMongoose.movieModel;
    const Person = personMongoose.personModel;
    const NewMovie = movieMongoose.newMovieModel;
    const NewPerson = personMongoose.newPersonModel;
    const tmdbApi = new TmdbApi(API_TMDB_KEY, API_OMDB_KEY);
        /* const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        }); */
    let stats = {
      movies: 0,
      images: 0,
      videos: 0,
      keywords: 0,
      similar: 0,
      credits: 0,
      people: 0
    };

    class Updater extends EventEmitter {
      _getLocalLatestId (done) {
        Logger.info({ method: '_getLocalLatestId' });
        Movie
                    .find({}, { _id: 0, id: 1 })
                    .sort({ id: -1 })
                    .limit(1)
                    .exec(done);
      }

      _askForDownloadConfirmation (difference, localLatestId, tmdbLatestId) {
        let $this = this;
                /* let questionLines = [
                            `${LINE_SEPARATOR}`,
                            `Your local latest id is: ${localLatestId}.`,
                            `TMDB latest id is: ${tmdbLatestId}.`,
                            `There are ${difference} new movies.`,
                            `Do you want to download them now? [Y/n]${EOL}`
                        ];
                        rl.question(questionLines.join(`${EOL}`), (answer) => {
                            if (answer.toLowerCase() === AFFIRMATIVE_ANSWER) {
                                $this.emit(EVENTS.DOWNLOAD_NEW_MOVIES, localLatestId + 1, tmdbLatestId);
                            } else {
                                $this.emit(EVENTS.EXIT);
                            }
                        }); */
        $this.emit(EVENTS.DOWNLOAD_NEW_MOVIES, localLatestId + 1, tmdbLatestId);
      }

      _clearNewMoviesCollection (done) {
        Logger.info({ method: '_clearNewMoviesCollection' });
        NewMovie.remove({}, done);
      }

      _insertNewMovie (movie, endId, done) {
        let newMovie = new NewMovie(movie);
        newMovie.save((err, res) => {
          if (err) return done(err);
          Logger.info(`${res.id}/${endId}: Inserted '${res.title}' in db.`);
          stats.movies++;
          done();
        });
      }

      _insertImages (id, images, index, endIndex, done) {
        Logger.info(`${index}/${endIndex}: Inserting ${id} images into db.`);
        NewMovie.update({ id }, { $set: { images } }, (err) => {
          if (err) return done(err);
          Logger.info(`${index}/${endIndex}: Inserted images in db.`);
          stats.images++;
          done();
        });
      }

      _insertVideos (id, videos, index, endIndex, done) {
        Logger.info(`${index}/${endIndex}: Inserting ${id} videos into db.`);
        NewMovie.update({ id }, { $set: { videos } }, (err) => {
          if (err) return done(err);
          Logger.info(`${index}/${endIndex}: Inserted videos in db.`);
          stats.videos++;
          done();
        });
      }

      _insertKeywords (id, keywords, index, endIndex, done) {
        Logger.info(`${index}/${endIndex}: Inserting ${id} keywords into db.`);
        NewMovie.update({ id }, { $set: { keywords } }, (err) => {
          if (err) return done(err);
          Logger.info(`${index}/${endIndex}: Inserted keywords in db.`);
          stats.keywords++;
          done();
        });
      }

      _insertSimilar (id, similar, index, endIndex, done) {
        Logger.info(`${index}/${endIndex}: Inserting ${id} similar into db.`);
        NewMovie.update({ id }, { $set: { similar } }, (err) => {
          if (err) return done(err);
          Logger.info(`${index}/${endIndex}: Inserted similar in db.`);
          stats.similar++;
          done();
        });
      }

      _insertCredits (id, credits, index, endIndex, done) {
        Logger.info(`${index}/${endIndex}: Inserting ${id} credits into db.`);
        NewMovie.update({ id }, { $set: { credits } }, (err) => {
          if (err) return done(err);
          Logger.info(`${index}/${endIndex}: Inserted credits in db.`);
          stats.credits++;
          done();
        });
      }

      _updatedMovie (index, movie, id, endIndex, done) {
        Logger.info(`${index}/${endIndex}: Updating movie ${id} details into db.`);
                // let push = {};
                // push['rating.0.' + thisMonth] = movie.rating;
                // console.log(JSON.stringify(push));
        Movie.update({ id }, {
          $set: {
            popularity: movie.popularity,
            poster_path: movie.poster_path,
            vote_average: movie.vote_average,
            vote_count: movie.vote_count,
            'rating.0': movie.rating
          }
        }, { upsert: true }, (err) => {
          if (err) return done(err);
          Logger.info(`${index}/${endIndex}: Movie ${id} details has been updated in db.`);
          done();
        });
      }

      _insertPerson (id, person, index, endIndex, done) {
        Logger.info(`${index}/${endIndex}: Inserting ${id} person into db.`);
        let newPerson = new NewPerson(person);
        newPerson.save((err) => {
          if (err) return done(err);
          Logger.info(`${index}/${endIndex}: Inserted person in db.`);
          stats.people++;
          done();
        });
      }

      _getPerson (index, id, endIndex, done) {
        Logger.info(`${index}/${endIndex} Downloading person with id ${id}...`);
        tmdbApi.getPersonDetails(id, (err, person) => {
          if (err) return done(err);
          if (!person || !person.id) {
            Logger.warn({
              method: '_getPerson.TmdbErrorGetPerson',
              person
            });
            return done();
          }
          this._insertPerson(id, person, index, endIndex, done);
        });
      }

      _downloadPerTick (i, ticksFns, allDone, callback) {
        Logger.info({
          method: 'downloadPerTick',
          currentIndex: i,
          ticksFnsLength: ticksFns.length
        });

        function onDownloaded (err) {
          if (err && err instanceof Error) return allDone(err);
          callback(i, ticksFns, allDone, callback);
        }

        steed.parallel(new SteedState(onDownloaded), ticksFns[i], onDownloaded);
      }

      _tickDownloadedCallback (i, ticksFns, allDone, callback) {
        let $this = this;
        Logger.info({
          method: 'tickDownloadedCallback',
          currentIndex: i
        });
        if (i >= ticksFns.length) return allDone();

        Logger.info(`Starting new tick after ${TICK_TIMEOUT / 1000} seconds...`);
        setTimeout(() => {
          $this._downloadPerTick(++i, ticksFns, allDone, callback);
        }, TICK_TIMEOUT);
      }

      _getTicksFunctions (ids, getDataFn) {
        let ticksFns = [];
        let idsLength = ids.length;
        let ticksCount = Math.ceil(idsLength / REQUESTS_PER_TICK);
        let rowIndex = 0;
        for (let i = 0; i <= ticksCount; i++) {
          let currentTickFns = [];
          for (let j = rowIndex; j < rowIndex + REQUESTS_PER_TICK; j++) {
            if (j >= idsLength) break;
            currentTickFns.push(
                            getDataFn.bind(this, j, ids[j], idsLength)
                        );
          }
          rowIndex += REQUESTS_PER_TICK;
          if (currentTickFns.length) ticksFns.push(currentTickFns);
        }

        return ticksFns;
      }

      getMovieDetails (id, endId, done) {
        Logger.info(`${id}/${endId} Downloading...`);
        tmdbApi.getMovieDetails(id, (err, movie) => {
          if (err) return done(err);
          if (!movie || !movie.id) {
            Logger.warn({
              method: 'getMovieDetails.TmdbNoSuchResource',
              movie
            });
            return done();
          } else {
            if (movie.imdb_id) {
              tmdbApi.getInfoFromOmdb(movie.imdb_id, (errorFromOmdb, res) => {
                if (errorFromOmdb) return done(errorFromOmdb);
                if (res) {
                  movie.rating = res.ratings;
                  movie.box_office = res.box_office;
                  movie.alternative_image = res.alternative_image;
                  movie.rated = res.rated;
                  movie.plot = res.plot;
                }
                this._insertNewMovie(movie, endId, done);
              });
            } else {
              let releaseDate = movie.release_date;
              let year = releaseDate.substring(0, 4);
              tmdbApi.getInfoByTitleFromOmdb(movie.title, year, (errorFromOmdb, res) => {
                if (errorFromOmdb) return done(errorFromOmdb);

                if (res) {
                  movie.rating = res.ratings;
                  movie.box_office = res.box_office;
                  movie.alternative_image = res.alternative_image;
                  movie.rated = res.rated;
                  movie.plot = res.plot;
                }
                this._insertNewMovie(movie, endId, done);
              });
            }
          }
        });
      }

      getUpdateMovie (index, id, endIndex, done) {
        Logger.info(`${index}/${endIndex} Downloading new movie update for ${id}...`);
        Movie.findOne({ id }, { _id: 0, rating: 1 }).exec().then(rating => {
          tmdbApi.getMovieDetails(id, (err, movie) => {
            if (err) return done(err);
            if (!movie || !movie.id) {
              Logger.warn({
                method: 'getMovieDetails.TmdbNoSuchResource',
                movie
              });
              return done();
            } else {
              if (movie.imdb_id) {
                tmdbApi.getInfoFromOmdb(movie.imdb_id, (errorFromOmdb, res) => {
                  if (errorFromOmdb) return done(errorFromOmdb);
                  if (res) {
                    if (rating.rating[0]) {
                      if (typeof rating.rating[0][thisMonth] !== 'undefined' && rating.rating[0][thisMonth] !== null) {
                        rating.rating[0][thisMonth] = (res.ratings[thisMonth] === null || typeof res.ratings[thisMonth] === 'undefined') ? [] : res.ratings[thisMonth];
                      }
                    }

                    movie.rating = rating.rating;
                    movie.box_office = res.box_office;
                    movie.alternative_image = res.alternative_image;
                    movie.rated = res.rated;
                    movie.plot = res.plot;
                  }
                                    // console.log(JSON.stringify(movie));
                  this._updatedMovie(index, movie, id, endIndex, done);
                });
              } else {
                let releaseDate = movie.release_date;
                let year = releaseDate.substring(0, 4);
                tmdbApi.getInfoByTitleFromOmdb(movie.title, year, (errorFromOmdb, res) => {
                  if (errorFromOmdb) return done(errorFromOmdb);

                  if (res) {
                    movie.rating = res.ratings;
                    movie.box_office = res.box_office;
                    movie.alternative_image = res.alternative_image;
                    movie.rated = res.rated;
                    movie.plot = res.plot;
                  }
                  this._updatedMovie(index, movie, id, endIndex, done);
                });
              }
            }
          });
        });
      }

      getMovieImages (index, id, endIndex, done) {
        Logger.info(`${index}/${endIndex} Downloading images for ${id}...`);
        tmdbApi.getMovieImages(id, (err, images) => {
          if (err) return done(err);
          if (!images || !images.id) {
            Logger.warn({
              method: 'getMovieImages.TmdbErrorGetImages',
              images
            });
            return done();
          }
          this._insertImages(id, images, index, endIndex, done);
        });
      }

      getMovieVideos (index, id, endIndex, done) {
        Logger.info(`${index}/${endIndex} Downloading videos for ${id}...`);
        tmdbApi.getMovieVideos(id, (err, videos) => {
          if (err) return done(err);
          if (!videos || !videos.id) {
            Logger.warn({
              method: 'getMovieVideos.TmdbErrorGetVideos',
              videos
            });
            return done();
          }
          this._insertVideos(id, videos, index, endIndex, done);
        });
      }

      getMovieKeywords (index, id, endIndex, done) {
        Logger.info(`${index}/${endIndex} Downloading keywords for ${id}...`);
        tmdbApi.getMovieKeywords(id, (err, keywords) => {
          if (err) return done(err);
          if (!keywords || !keywords.id) {
            Logger.warn({
              method: 'getMovieKeywords.TmdbErrorGetKeywords',
              keywords
            });
            return done();
          }
          this._insertKeywords(id, keywords, index, endIndex, done);
        });
      }

      getMovieSimilar (index, id, endIndex, done) {
        Logger.info(`${index}/${endIndex} Downloading similar for ${id}...`);
        tmdbApi.getMovieSimilar(id, (err, similar) => {
          if (err) return done(err);
          if (!similar || !similar.results) {
            Logger.warn({
              method: 'getMovieSimilar.TmdbErrorGetSimilar',
              similar
            });
            return done();
          }
          this._insertSimilar(id, similar.results, index, endIndex, done);
        });
      }

      getMovieCredits (index, id, endIndex, done) {
        Logger.info(`${index}/${endIndex} Downloading credits for ${id}...`);
        tmdbApi.getMovieCredits(id, (err, credits) => {
          if (err) return done(err);
          if (!credits) {
            Logger.warn({
              method: 'getMovieCredits.TmdbErrorGetCredits',
              credits
            });
            return done();
          }
          this._insertCredits(id, credits, index, endIndex, done);
        });
      }

      start () {
        let $this = this;
        Logger.info({ method: 'start' });

        steed.waterfall(new SteedState(done), [
          $this._getLocalLatestId,
          (localLatest, next) => {
            let localLatestId = 1;
            if (localLatest && localLatest.length && localLatest[0].id) {
              localLatestId = localLatest[0].id;
            }

            Logger.info({
              method: 'start.getTmdbLatestId',
              localLatestId
            });
            tmdbApi.getLatestId((err, tmdbLatestId) => {
              if (err) return next(err);
              next(null, localLatestId, tmdbLatestId);
            });
          },
          (localLatestId, tmdbLatestId, next) => {
            let difference = tmdbLatestId - localLatestId;
            if (difference <= 0) {
              return $this.emit(EVENTS.NO_NEW_MOVIES, localLatestId, tmdbLatestId);
            }

            next(null, difference, localLatestId, tmdbLatestId);
          },
          $this._askForDownloadConfirmation.bind($this)
        ], done);

        function done (err) {
          if (err) $this.emit(EVENTS.ERROR, err);
        }
      }

      downloadNewMoviesDetails (startId, endId) {
        let $this = this;
        Logger.info({ method: 'downloadNewMoviesDetails', startId, endId });

        $this._clearNewMoviesCollection((err, result) => {
          if (err) return $this.emit(EVENTS.ERROR, err);

          Logger.info({ method: 'downloadNewMoviesDetails.newMoviesCleared' });

          let ticksFns = [];
          for (let i = startId; i <= endId; i += REQUESTS_PER_TICK) {
            let currentTickFns = [];
            for (let j = i; j < i + REQUESTS_PER_TICK; j++) {
              if (j > endId) break;
              currentTickFns.push(
                                $this.getMovieDetails.bind($this, j, endId)
                            );
            }
            if (currentTickFns.length) ticksFns.push(currentTickFns);
          }

          $this._downloadPerTick(0, ticksFns, done, $this._tickDownloadedCallback.bind($this));

          function done (err) {
            if (err) $this.emit(EVENTS.ERROR, err.message);
            NewMovie.count((err, count) => {
              if (err) {
                return $this.emit(
                                    EVENTS.ERROR,
                                    `Could not get count of ${movieMongoose.newMovieModel.name} collection`
                                );
              }
              let expectedSavedMoviesCount = endId - startId;
              if (count !== expectedSavedMoviesCount) {
                Logger.warn(`Expected ${expectedSavedMoviesCount} to be saved, but only ${count} were saved!`);
              }
              $this.emit(EVENTS.NEW_MOVIES_DETAILS_DOWNLOADED);
            });
          }
        });
      }

      updateMovies (dataType, getDataFn, endEvent) {
        let $this = this;
        Logger.info({ method: 'updateMoviesDetails' });
        let movieIds = [];
        Movie
                    .find({}, { _id: 0, id: 1 })
                    .cursor()
                    .on('data', (movie) => {
                      movieIds.push(movie.id);
                    })
                    .on('close', () => {
                      Logger.info(`Found ${movieIds.length} movie ids in db. Starting to update ${dataType}...`);

                      let ticksFns = $this._getTicksFunctions(movieIds, getDataFn);
                      $this._downloadPerTick(0, ticksFns, done, $this._tickDownloadedCallback.bind($this));

                      function done (err) {
                        if (err) $this.emit(EVENTS.ERROR, err.message);
                        $this.emit(endEvent);
                      }
                    });
      }

      downloadMovieData (dataType, getDataFn, endEvent) {
        let $this = this;
        Logger.info({ method: 'downloadMovieData', dataType });

        let movieIds = [];
        NewMovie
                    .find({}, { _id: 0, id: 1 })
                    .cursor()
                    .on('data', (movie) => {
                      movieIds.push(movie.id);
                    })
                    .on('close', () => {
                      Logger.info(`Found ${movieIds.length} movie ids in db. Starting to download ${dataType}...`);

                      let ticksFns = $this._getTicksFunctions(movieIds, getDataFn);
                      $this._downloadPerTick(0, ticksFns, done, $this._tickDownloadedCallback.bind($this));

                      function done (err) {
                        if (err) $this.emit(EVENTS.ERROR, err.message);
                        $this.emit(endEvent);
                      }
                    });
      }

      downloadPeople () {
        let $this = this;
        Logger.info({ method: 'downloadPeople' });

        let people = [];
        NewMovie
                    .find({}, { _id: 0, id: 1, credits: 1 })
                    .cursor()
                    .on('data', (movie) => {
                      if (!movie.credits) return;
                      if (movie.credits.hasOwnProperty('cast') && movie.credits.cast && movie.credits.cast.length) {
                        people = people.concat(movie.credits.cast.map(({ id }) => {
                          return id;
                        }));
                      }
                      if (movie.credits.hasOwnProperty('crew') && movie.credits.crew && movie.credits.crew.length) {
                        people = people.concat(movie.credits.crew.map(({ id }) => {
                          return id;
                        }));
                      }
                    })
                    .on('close', () => {
                      Logger.info(`Found ${people.length} people ids in movie credits. Starting to download people...`);
                      let alreadySavedPeople = [];
                      NewPerson
                            .find({}, { _id: 0, id: 1 })
                            .cursor()
                            .on('data', (person) => {
                              alreadySavedPeople.push(person.id);
                            })
                            .on('close', () => {
                              Logger.info(`Found ${alreadySavedPeople.length} already saved people.`);
                              people = people.filter((personId) => {
                                return alreadySavedPeople.indexOf(personId) === -1;
                              });
                              Logger.info(`There are ${people.length} unsaved people. Starting to download people...`);

                              let ticksFns = [];
                              let peopleIdsLength = people.length;
                              let ticksCount = Math.ceil(peopleIdsLength / REQUESTS_PER_TICK);
                              let rowIndex = 0;
                              for (let i = 0; i <= ticksCount; i++) {
                                let currentTickFns = [];
                                for (let j = rowIndex; j < rowIndex + REQUESTS_PER_TICK; j++) {
                                  if (j >= peopleIdsLength) break;
                                  currentTickFns.push(
                                            $this._getPerson.bind($this, j, people[j], peopleIdsLength)
                                        );
                                }
                                rowIndex += REQUESTS_PER_TICK;
                                if (currentTickFns.length) ticksFns.push(currentTickFns);
                              }

                              $this._downloadPerTick(0, ticksFns, done, $this._tickDownloadedCallback.bind($this));

                              function done (err) {
                                if (err) $this.emit(EVENTS.ERROR, err.message);
                                $this.emit(EVENTS.PEOPLE_DOWNLOADED);
                              }
                            });
                    });
      }

      askToMoveNewDataToMainCollections () {
        let $this = this;
                /* let questionLines = [
                            `${LINE_SEPARATOR}`,
                            `The script is over.`,
                            `All the available data was downloaded and stored in the temporary '${config.tmpMoviesCollection}' and '${config.tmpPeopleCollection}' collections.`,
                            `Here are some stats for the collected data:`,
                            Object.keys(stats).map((statKey) => {
                                return `new ${statKey} collected: ${stats[statKey]}`
                            }).join(EOL),
                            `${LINE_SEPARATOR}`,
                            `Please go to your database and ensure that everything is in order.`,
                            `If everything looks right answer here with 'Y' to transfer all the new data to the main collections ('${config.mainMoviesCollection}' and '${config.mainPeopleCollection}').`,
                            `If not you can answer with 'n' or close the script and do that later with the option '--transfer-data'.`,
                            `Do you want to transfer the new data to the main collections now? [Y/n]${EOL}`
                        ];
                        rl.question(questionLines.join(`${EOL}`), (answer) => {
                            if (answer.toLowerCase() === AFFIRMATIVE_ANSWER) {
                                $this.emit(EVENTS.TRANSFER_NEW_DATA);
                            } else {
                                $this.emit(EVENTS.EXIT);
                            }
                            rl.close();
                        }); */
        $this.emit(EVENTS.TRANSFER_NEW_DATA);
      }

      transferNewData () {
        let $this = this;
        Logger.info({ method: 'transferNewData' });
        Logger.info('Starting to transfer movies...');
        let moviesCount = 0;
        NewMovie
                    .find({}, { _id: 0 })
                    .cursor()
                    .on('data', (movie) => {
                      Movie.collection.insert(movie);
                      moviesCount++;
                    })
                    .on('close', () => {
                      Logger.info(`${moviesCount} have been transferred from ${movieMongoose.newMovieModel.name} to '${movieMongoose.movieModel.name}' collection.`);
                      Logger.info('Starting to transfer people...');
                      let peopleCount = 0;
                      NewPerson
                            .find({}, { _id: 0 })
                            .cursor()
                            .on('data', (person) => {
                              Person.collection.insert(person);
                              peopleCount++;
                            })
                            .on('close', () => {
                              Logger.info(`${peopleCount} people have been transferred from '${movieMongoose.newMovieModel.name}' to '${movieMongoose.movieModel.name}' collection.`);
                              $this.emit(EVENTS.NEW_DATA_TRANSFERRED);
                            });
                    });
      }
        }

    const U = new Updater();

    U.on(EVENTS.START, () => {
      U.start();
    });

    U.on(EVENTS.NO_NEW_MOVIES, (localLatestId, tmdbLatestId) => {
      Logger.info({
        method: EVENTS.NO_NEW_MOVIES,
        localLatestId,
        tmdbLatestId
      });
      process.exit();
    });

    U.on(EVENTS.DOWNLOAD_NEW_MOVIES, (startId, endId) => {
      Logger.info({ method: EVENTS.DOWNLOAD_NEW_MOVIES, startId, endId });
      U.downloadNewMoviesDetails(startId, endId);
    });

    U.on(EVENTS.NEW_MOVIES_DETAILS_DOWNLOADED, (err) => {
      Logger.info({ method: EVENTS.NEW_MOVIES_DETAILS_DOWNLOADED, err });
      U.downloadMovieData('images', U.getMovieImages, EVENTS.IMAGES_DOWNLOADED);
    });

    U.on(EVENTS.IMAGES_DOWNLOADED, (err) => {
      Logger.info({ method: EVENTS.IMAGES_DOWNLOADED, err });
      U.downloadMovieData('videos', U.getMovieVideos, EVENTS.VIDEOS_DOWNLOADED);
    });

    U.on(EVENTS.VIDEOS_DOWNLOADED, (err) => {
      Logger.info({ method: EVENTS.VIDEOS_DOWNLOADED, err });
      U.downloadMovieData('keywords', U.getMovieKeywords, EVENTS.KEYWORDS_DOWNLOADED);
    });

    U.on(EVENTS.KEYWORDS_DOWNLOADED, (err) => {
      Logger.info({ method: EVENTS.KEYWORDS_DOWNLOADED, err });
      U.downloadMovieData('similar', U.getMovieSimilar, EVENTS.SIMILAR_DOWNLOADED);
    });

    U.on(EVENTS.SIMILAR_DOWNLOADED, (err) => {
      Logger.info({ method: EVENTS.SIMILAR_DOWNLOADED, err });
      U.downloadMovieData('credits', U.getMovieSimilar, EVENTS.CREDITS_DOWNLOADED);
    });

    U.on(EVENTS.CREDITS_DOWNLOADED, (err) => {
      Logger.info({ method: EVENTS.CREDITS_DOWNLOADED, err });
      U.downloadPeople();
    });

    U.on(EVENTS.PEOPLE_DOWNLOADED, (err) => {
      Logger.info({ method: EVENTS.PEOPLE_DOWNLOADED, err });
      U.askToMoveNewDataToMainCollections();
    });

    U.on(EVENTS.UPDATE_MOVIE, (err) => {
      Logger.info({ method: EVENTS.UPDATE_MOVIE, err });
      U.updateMovies('movie', U.getUpdateMovie, EVENTS.EXIT);
    });

    U.on(EVENTS.TRANSFER_NEW_DATA, (err) => {
      Logger.info({ method: EVENTS.TRANSFER_NEW_DATA, err });
      U.transferNewData();
    });

    U.on(EVENTS.NEW_DATA_TRANSFERRED, (err) => {
      Logger.info({ method: EVENTS.NEW_DATA_TRANSFERRED, err });
      Logger.info('All data has been transferred you can close the script now...');
      process.exit();
    });

    U.on(EVENTS.ERROR, (err) => {
      Logger.info({ method: EVENTS.ERROR, err });
      process.exit();
    });

    U.on(EVENTS.EXIT, () => {
      Logger.info({ method: EVENTS.EXIT });
      process.exit();
    });

    mongoose.connection.on('error', handleError);
    mongoose.connection.on('open', () => {
      Logger.info(`Connected to ${config.get('mongodb')['url']}...`);
      if (transferData) return U.emit(EVENTS.TRANSFER_NEW_DATA);
      switch (step) {
        case STEP.MOVIES:
          U.emit(EVENTS.START);
          break;
        case STEP.IMAGES:
          U.emit(EVENTS.NEW_MOVIES_DETAILS_DOWNLOADED);
          break;
        case STEP.VIDEOS:
          U.emit(EVENTS.IMAGES_DOWNLOADED);
          break;
        case STEP.KEYWORDS:
          U.emit(EVENTS.VIDEOS_DOWNLOADED);
          break;
        case STEP.SIMILAR:
          U.emit(EVENTS.KEYWORDS_DOWNLOADED);
          break;
        case STEP.CREDITS:
          U.emit(EVENTS.SIMILAR_DOWNLOADED);
          break;
        case STEP.PEOPLE:
          U.emit(EVENTS.CREDITS_DOWNLOADED);
          break;
        case STEP.UPDATE:
          U.emit(EVENTS.UPDATE_MOVIE);
          break;
        default:
          U.emit(EVENTS.START);
          break;
      }
    });
  }
};
