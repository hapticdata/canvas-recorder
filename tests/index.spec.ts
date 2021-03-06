import JSZip from "jszip";

import { cleanup, draw, getCanvas, getContext, options, reset, start, stop } from "../src";
import { base64ToImage } from "./helpers";

describe( "canvas-recorder", () => {

    it( "should return a canvas element", () => {
        expect( getCanvas() instanceof HTMLCanvasElement ).to.be( true );
    } );

    it( "should return a drawing context", () => {
        expect( getContext() instanceof CanvasRenderingContext2D ).to.be( true );
        expect( getContext().canvas ).to.be( getCanvas() );
        expect( getCanvas().getContext( "2d" ) ).to.be( getContext() );
    } );

    describe( "options", () => {

        beforeEach( () => {
            reset();
        } );

        it( "should set canvas to correct size", () => {
            options( {
                size: [ 300, 500 ],
            } );

            const canvas = getCanvas();

            expect( canvas.width ).to.be( 300 );
            expect( canvas.height ).to.be( 500 );
        } );

        it( "should set the clear color to black", () => {
            options( {
                color: "black",
                clear: true,
                record: false,
            } );

            draw( ( context ) => {
                const data =  context.getImageData( 0, 0, 1, 1 ).data;

                expect( data[ 0 ] ).to.be( 0 );
                expect( data[ 1 ] ).to.be( 0 );
                expect( data[ 2 ] ).to.be( 0 );
                expect( data[ 3 ] ).to.be( 255 );

                stop();
            } );

            start();
        } );

        it( "should clear the previous content", ( done: MochaDone ) => {

            let count = 0;

            options( {
                clear: true,
                record: false,
            } );

            draw( ( context ) => {
                const data =  context.getImageData( 0, 0, 1, 1 ).data;

                expect( data[ 0 ] ).to.be( 255 );
                expect( data[ 1 ] ).to.be( 255 );
                expect( data[ 2 ] ).to.be( 255 );
                expect( data[ 3 ] ).to.be( 255 );

                context.fillStyle = "green";
                context.fillRect( 0, 0, 1, 1 );

                count++;

                if ( count > 2 ) {
                    stop();
                    done();
                }
            } );

            start();
        } );

        it( "should not clear the previous canvas", ( done: MochaDone ) => {
            let count = 0;

            options( {
                clear: false,
                record: false,
            } );

            draw( ( context ) => {
                const data =  context.getImageData( 0, 0, 1, 1 ).data;

                if ( count > 0 ) {
                    expect( data[ 0 ] ).to.be( 0 );
                    expect( data[ 1 ] ).to.be( 255 );
                    expect( data[ 2 ] ).to.be( 0 );
                    expect( data[ 3 ] ).to.be( 255 );
                }

                context.fillStyle = "rgb( 0, 255, 0 )";
                context.fillRect( 0, 0, 1, 1 );

                count++;

                if ( count > 2 ) {
                    stop();
                    done();
                }
            } );

            start();
        } );

        it( "should call draw 3 times", ( done: MochaDone ) => {
            let count = 0;

            options( {
                frames: 3,
                record: false,
            } );

            draw( () => {
                count++;
            } );

            cleanup( () => {
                expect( count ).to.be( 3 );
                done();
            } );

            start();
        } );

        it( "should throw when changing options while animating", () => {
            options( {
                record: false,
            } );

            draw( () => {} );
            start();

            expect( () => options( { color: "green" } ) ).to.throwError();

            stop();
        } );

        it ( "should fix delta time when recording", ( done: MochaDone ) => {
            options( {
                fps: 10,
                onComplete: () => {},
            } );

            let count = 0;

            draw( ( _ , delta: number ) => {
                expect( delta ).to.be( count * 100 );

                if ( ++count > 10 ) {
                    stop();
                    done();
                }
            } );

            start();
        } );

    } );

    describe( "zip", () => {

        beforeEach( () => {
            reset();
        } );

        it( "should recieve a zip as blob", ( done: MochaDone ) => {
            options( {
                frames: 2,
                onComplete: ( blob: Blob ) => {
                    expect( blob instanceof Blob ).to.be( true );
                    expect( blob.type ).to.be( "application/zip" );
                    done();
                },
            } );

            draw( ( context: CanvasRenderingContext2D ) => {
                context.fillStyle = "black";
                context.fillRect( 10, 10, 100, 100 );
            } );

            start();
        } );

        it( "should contain 3 images", ( done: MochaDone ) => {

            function verify( blob: Blob ) {
                JSZip.loadAsync( blob )
                    .then( ( zip: JSZip ) => {
                        let count = 0;

                        zip.forEach( ( path: string ) => {
                            expect( path ).to.be( `00000${ count++ }.png` );
                        } );

                        done();
                    } );
            }

            options( {
                frames: 3,
                onComplete: verify,
            } );

            draw( ( context: CanvasRenderingContext2D ) => {
                context.fillStyle = "black";
                context.fillRect( 10, 10, 100, 100 );
            } );

            start();
        } );

        it( "should create images in the correct size", ( done: MochaDone ) => {
            function verify( blob: Blob ) {
                JSZip.loadAsync( blob )
                    .then( ( zip: JSZip ) => zip.file( "000000.png" ).async( "base64" ) )
                    .then( base64ToImage )
                    .then( ( image: HTMLImageElement ) => {
                        expect( image.width ).to.be( 3 );
                        expect( image.height ).to.be( 5 );
                        done();
                    } );
            }

            options( {
                size: [ 3, 5 ],
                frames: 1,
                onComplete: verify,
            } );

            draw( () => {} );

            start();
        } );

        it( "should create uncompressed images", ( done: MochaDone ) => {

            function verify( blob: Blob ) {
                JSZip.loadAsync( blob )
                    .then( ( zip: JSZip ) => {
                        return Promise.all( [
                            "000000.png",
                            "000001.png",
                            "000002.png",
                            "000003.png",
                        ].map( name => zip.file( name ).async( "base64" ) ) );
                    } )
                    .then( ( contents: string[] ) => {
                        return Promise.all( contents.map( content => base64ToImage( content ) ) ) ;
                    } )
                    .then( ( images: HTMLImageElement[] ) => {
                        images.forEach( ( image: HTMLImageElement, index: number ) => {
                            const n = index + 1;
                            const canvas = document.createElement( "canvas" );
                            const context = canvas.getContext( "2d" )!;

                            canvas.width = image.width;
                            canvas.height = image.height;

                            context.drawImage( image, 0, 0 );

                            const data = context.getImageData( 0, 0, 4, 1 ).data;

                            for ( let x = 0; x < 16; x += 4 ) {
                                expect( data[ x ] ).to.be( 10 * n );
                                expect( data[ x + 1 ] ).to.be( 20 * n );
                                expect( data[ x + 2] ).to.be( 30 * n );
                            }
                        } );

                        done();
                    } );
            }

            options( {
                size: [ 4, 1 ],
                frames: 4,
                onComplete: verify,
            } );

            let frame = 1;

            draw( ( context: CanvasRenderingContext2D ) => {

                for ( let x = 0; x < 4; x++ ) {
                    context.fillStyle = `rgb( ${ 10 * frame }, ${ 20 * frame }, ${ 30 * frame } )`;
                    context.fillRect( x, 0, 1, 1 );
                }

                frame++;

            } );

            start();
        } );

    } );

} );
