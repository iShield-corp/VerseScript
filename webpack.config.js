const path = require('path');

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'verseScript.min.js',
    path: path.resolve(__dirname, 'dist'),
    library: 'VerseScript',
    libraryTarget: 'umd',
    sourceMapFilename: '[file].map',
  },
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.(js)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      },
    ],
  },
};