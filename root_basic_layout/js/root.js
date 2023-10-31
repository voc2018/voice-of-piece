<!-- owl carousel(main)  -->
jQuery(function($){
	$('.loop').owlCarousel({
		center: true,
		items:3,
		loop:true,
		margin:0,
		nav:true,
		autoplay:true,
		autoWidth:false,
		navText:["<img src='layouts/root_layout/img/root_slider-prev.png'>","<img src='layouts/root_layout/img/root_slider-next.png'>"],
		responsive:{
			0:{
				items:1,
				nav:true
			},
			425:{
            	items:1,
            	nav:true
        	},
			768:{
				items:1,
				nav:true
			},
			992:{
            	items:1,
            	nav:true
        	},
			1440:{
            	items:1,
            	nav:true
        	}
		}
	});
});
<!-- owl carousel(main)  -->

jQuery(function($){
    "use strict"; // Start of use strict

    // jQuery for page scrolling feature - requires jQuery Easing plugin
    $('a.page-scroll').bind('click', function(event) {
        var $anchor = $(this);
        $('html, body').stop().animate({
            scrollTop: ($($anchor.attr('href')).offset().top - 50)
        }, 800, 'easeInOutExpo');
        event.preventDefault();
    });

    // Highlight the top nav as scrolling occurs
    $('body').scrollspy({
        target: '.navbar-fixed-top',
        offset: 51
    });

    // Closes the Responsive Menu on Menu Item Click
    $('.navbar-collapse ul li a:not(.dropdown-toggle)').click(function() {
        $('.navbar-toggle:visible').click();
    });

    // Offset for Main Navigation
    $('#mainNav').affix({
        offset: {
            top: 100
        }
    })

    // Initialize and Configure Scroll Reveal Animation
    window.sr = ScrollReveal();
    sr.reveal('.sr-icons', {
        duration: 600,
        scale: 0.3,
        distance: '0px'
    }, 200);
    sr.reveal('.sr-button', {
        duration: 1000,
        delay: 200
    });
    sr.reveal('.sr-contact', {
        duration: 600,
        scale: 0.3,
        distance: '0px'
    }, 300);

    // Initialize and Configure Magnific Popup Lightbox Plugin
    $('.popup-gallery').magnificPopup({
        delegate: 'a',
        type: 'image',
        tLoading: 'Loading image #%curr%...',
        mainClass: 'mfp-img-mobile',
        gallery: {
            enabled: true,
            navigateByImgClick: true,
            preload: [0, 1] // Will preload 0 - before current, and 1 after the current image
        },
        image: {
            tError: '<a href="%url%">The image #%curr%</a> could not be loaded.'
        }
    });

});




jQuery(function($){
	$(document).on('ready', function() {

		// 로그인 에러메시지 있을 때 팝업창 유지
		if($('#modal-login .message.error').length) {
			 $('#modal-login').modal('show');
		}
	});
});

<!-- 로그인 에러메세지 닫기  -->
jQuery(function($){
	$(document).ready(function(){
		$("#error_msg .close").click(function(){
			$("#error_msg").remove();
		});
	});
});
